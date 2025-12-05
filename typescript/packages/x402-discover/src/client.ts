import { facilitators, type Facilitator } from "./facilitators.js";
import type { Resource, DiscoveryResponse, Tool, PaymentRequirements } from "./types.js";

// Simple in-memory cache
interface CacheEntry {
  tools: Tool[];
  timestamp: number;
  facilitatorId: string;
}

const cache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Convert atomic units to human readable price
// Assumes 6 decimals (USDC)
function formatPrice(atomicUnits: string, decimals = 6): string {
  try {
    // Handle decimal strings (some APIs return "$0.01" format already)
    if (atomicUnits.includes(".") || atomicUnits.startsWith("$")) {
      return atomicUnits.startsWith("$") ? atomicUnits : `$${atomicUnits}`;
    }

    const value = BigInt(atomicUnits);
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0");
    // Trim trailing zeros but keep at least 2 decimal places
    const trimmed = fractionStr.replace(/0+$/, "").padEnd(2, "0");
    return `$${whole}.${trimmed}`;
  } catch {
    return atomicUnits; // Return as-is if parsing fails
  }
}

// Normalize network names
function normalizeNetwork(network: string): string {
  const mapping: Record<string, string> = {
    "eip155:8453": "base",
    "eip155:84532": "base-sepolia",
    "eip155:1": "ethereum",
    "eip155:137": "polygon",
  };
  return mapping[network] || network;
}

// Fetch all resources from a single facilitator with pagination
async function fetchAllFromFacilitator(
  facilitator: Facilitator
): Promise<{ resources: Resource[]; error?: string }> {
  const allResources: Resource[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  const endpoint = facilitator.listEndpoint || "/discovery/resources";

  while (hasMore) {
    const url = `${facilitator.url}${endpoint}?limit=${limit}&offset=${offset}`;

    try {
      let response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      // Try alternate endpoints if primary fails
      if (!response.ok) {
        const altUrls = [
          `${facilitator.url}/list?limit=${limit}&offset=${offset}`,
          `${facilitator.url}/resources?limit=${limit}&offset=${offset}`,
        ];

        for (const altUrl of altUrls) {
          try {
            response = await fetch(altUrl, {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(10000),
            });
            if (response.ok) break;
          } catch {
            // Continue trying
          }
        }
      }

      if (!response.ok) {
        return { resources: allResources, error: `HTTP ${response.status}` };
      }

      const data: DiscoveryResponse = await response.json();
      const items = data.items || [];
      allResources.push(...items);

      // Check if there are more pages
      if (items.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Safety limit - don't fetch more than 1000 items per facilitator
      if (offset >= 1000) {
        hasMore = false;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      return { resources: allResources, error };
    }
  }

  return { resources: allResources };
}

// Fetch status for debugging
export interface FetchStatus {
  facilitatorId: string;
  facilitatorName: string;
  status: "success" | "partial" | "failed";
  toolCount: number;
  error?: string;
  cached: boolean;
}

// Fetch all resources from all facilitators with caching
export async function fetchAllResources(options: { skipCache?: boolean } = {}): Promise<{
  tools: Tool[];
  status: FetchStatus[];
}> {
  const allTools: Tool[] = [];
  const status: FetchStatus[] = [];
  const now = Date.now();

  const results = await Promise.allSettled(
    facilitators.map(async (f) => {
      // Check cache first
      const cached = cache.get(f.id);
      if (!options.skipCache && cached && now - cached.timestamp < CACHE_TTL) {
        return { facilitator: f, tools: cached.tools, cached: true };
      }

      const { resources, error } = await fetchAllFromFacilitator(f);
      const tools: Tool[] = [];

      for (const resource of resources) {
        tools.push(...resourceToTools(resource, f.id));
      }

      // Update cache
      cache.set(f.id, { tools, timestamp: now, facilitatorId: f.id });

      return { facilitator: f, tools, error, cached: false };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { facilitator, tools, error, cached } = result.value;
      allTools.push(...tools);

      status.push({
        facilitatorId: facilitator.id,
        facilitatorName: facilitator.name,
        status: error ? (tools.length > 0 ? "partial" : "failed") : "success",
        toolCount: tools.length,
        error,
        cached,
      });
    } else {
      // Promise rejected entirely
      const facilitator = facilitators.find(f =>
        result.reason?.message?.includes(f.url)
      );
      status.push({
        facilitatorId: facilitator?.id || "unknown",
        facilitatorName: facilitator?.name || "Unknown",
        status: "failed",
        toolCount: 0,
        error: result.reason?.message || "Unknown error",
        cached: false,
      });
    }
  }

  return { tools: allTools, status };
}

// Convert a resource to Tool(s) - one per payment option
function resourceToTools(resource: Resource, facilitatorId: string): Tool[] {
  return resource.accepts.map((accept) => ({
    url: resource.resource,
    description: accept.description || resource.metadata?.category || "",
    price: formatPrice(accept.maxAmountRequired),
    priceRaw: accept.maxAmountRequired,
    network: normalizeNetwork(accept.network),
    networkRaw: accept.network,
    asset: accept.asset,
    payTo: accept.payTo,
    facilitator: facilitatorId,
  }));
}

// Search tools by keyword
export async function searchTools(query: string): Promise<Tool[]> {
  const { tools } = await fetchAllResources();
  const q = query.toLowerCase();

  return tools.filter(
    (t) =>
      t.url.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
  );
}

// Fetch pricing for a specific URL by hitting it without payment
export async function fetchPricing(url: string): Promise<PaymentRequirements[] | null> {
  try {
    // Try GET first
    let response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    // If 405, try POST
    if (response.status === 405) {
      response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
    }

    if (response.status === 402) {
      const data = await response.json();
      return data.accepts || null;
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch pricing for ${url}:`, error);
    return null;
  }
}

// List all known facilitators
export function listFacilitators(): Facilitator[] {
  return facilitators;
}
