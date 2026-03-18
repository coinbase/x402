/**
 * Debug utilities for diagnosing Bazaar discovery issues
 *
 * These utilities help diagnose common discovery problems like:
 * - Stale discovery metadata after seller route updates
 * - Resource canonicalization mismatches
 * - Discovery refresh timing issues
 *
 * Related to issue #1659: Bazaar discovery does not refresh seller metadata
 * after route updates
 */

import type { DiscoveryResource } from "./facilitatorClient";
import type { HTTPFacilitatorClient } from "@x402/core/http";

export interface DiscoveryDebugInfo {
  /** The canonical resource URL (stripped of query params and fragments) */
  canonicalUrl: string;
  /** The original resource URL as stored in discovery */
  originalUrl: string;
  /** When the resource was last updated in discovery */
  lastUpdated: Date;
  /** How many milliseconds ago the resource was last updated */
  ageMs: number;
  /** Discovery metadata (may be stale if not refreshed properly) */
  metadata: Record<string, unknown>;
  /** The first payment requirement for this resource */
  primaryPaymentRequirement?: unknown;
}

export interface DiscoveryRefreshAnalysis {
  /** Resource debug information */
  resource: DiscoveryDebugInfo;
  /** Analysis of potential issues */
  issues: string[];
  /** Recommendations for resolving issues */
  recommendations: string[];
  /** Severity level of any detected issues */
  severity: "none" | "warning" | "error";
}

/**
 * Canonicalizes a URL by removing query parameters and fragments.
 * This matches the canonicalization logic used by the discovery system.
 *
 * @param url - The URL to canonicalize
 * @returns The canonicalized URL (without query parameters or fragments)
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    // Fallback for malformed URLs - strip query and fragment manually
    return url.split("?")[0].split("#")[0];
  }
}

/**
 * Converts a discovery resource to debug information for analysis.
 *
 * @param resource - The discovery resource to convert
 * @returns Debug information object for analysis
 */
export function resourceToDebugInfo(resource: DiscoveryResource): DiscoveryDebugInfo {
  const lastUpdated = new Date(resource.lastUpdated);
  const now = new Date();
  const ageMs = now.getTime() - lastUpdated.getTime();

  return {
    canonicalUrl: canonicalizeUrl(resource.resource),
    originalUrl: resource.resource,
    lastUpdated,
    ageMs,
    metadata: resource.metadata || {},
    primaryPaymentRequirement: resource.accepts[0],
  };
}

/**
 * Analyzes a discovery resource for potential refresh issues.
 *
 * @param resource - The discovery resource to analyze
 * @param expectedCanonicalUrl - Optional expected canonical URL for comparison
 * @returns Analysis of potential discovery refresh issues
 */
export function analyzeDiscoveryRefresh(
  resource: DiscoveryResource,
  expectedCanonicalUrl?: string,
): DiscoveryRefreshAnalysis {
  const debugInfo = resourceToDebugInfo(resource);
  const issues: string[] = [];
  const recommendations: string[] = [];
  let severity: "none" | "warning" | "error" = "none";

  // Check if resource is very stale (older than 1 hour) - but only for positive ages
  const oneHourMs = 60 * 60 * 1000;
  if (debugInfo.ageMs > oneHourMs) {
    issues.push(
      `Resource is stale: last updated ${Math.round(debugInfo.ageMs / (1000 * 60))} minutes ago`,
    );
    recommendations.push("Check if the seller has redeployed and discovery needs to refresh");
    if (severity === "none") severity = "warning";
  }

  // Check if resource is extremely stale (older than 24 hours) - but only for positive ages
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  if (debugInfo.ageMs > twentyFourHoursMs) {
    issues.push(
      `Resource is extremely stale: last updated ${Math.round(debugInfo.ageMs / (1000 * 60 * 60))} hours ago`,
    );
    severity = "error";
  }

  // Check for URL canonicalization mismatch
  if (expectedCanonicalUrl && debugInfo.canonicalUrl !== expectedCanonicalUrl) {
    issues.push(
      `Canonical URL mismatch: discovery has '${debugInfo.canonicalUrl}', expected '${expectedCanonicalUrl}'`,
    );
    recommendations.push("Verify the seller is advertising the expected primary route");
    severity = "error";
  }

  // Check for query parameters in stored resource URL (should be canonicalized)
  if (debugInfo.originalUrl.includes("?") || debugInfo.originalUrl.includes("#")) {
    issues.push("Resource URL contains query parameters or fragments - should be canonicalized");
    recommendations.push("Discovery system should canonicalize URLs before storage");
    if (severity === "none") severity = "warning";
  }

  // Check if metadata is empty (could indicate incomplete discovery)
  if (Object.keys(debugInfo.metadata).length === 0) {
    issues.push("Resource metadata is empty - discovery may be incomplete");
    recommendations.push(
      "Check if the seller is properly advertising metadata via discovery extensions",
    );
    if (severity === "none") severity = "warning";
  }

  return {
    resource: debugInfo,
    issues,
    recommendations,
    severity,
  };
}

/**
 * Searches for discovery resources by canonical URL and analyzes refresh status.
 *
 * @param client - The facilitator client to query discovery with
 * @param canonicalUrl - The canonical URL to search for
 * @param expectedMetadata - Optional expected metadata for comparison
 * @returns Analysis results for matching resources
 */
export async function debugDiscoveryRefresh(
  client: HTTPFacilitatorClient,
  canonicalUrl: string,
  expectedMetadata?: Record<string, unknown>,
): Promise<{
  found: boolean;
  analysis?: DiscoveryRefreshAnalysis;
  error?: string;
}> {
  try {
    // Query discovery for resources - we'll need to extend the client first
    const withBazaar = await import("./facilitatorClient").then(mod => mod.withBazaar);
    const bazaarClient = withBazaar(client);

    // Get all HTTP resources (we could optimize this with search in the future)
    const response = await bazaarClient.extensions.discovery.listResources({
      type: "http",
      limit: 1000, // Large limit to catch the resource
    });

    // Find the resource by canonical URL
    const targetCanonical = canonicalizeUrl(canonicalUrl);
    const matchingResource = response.items.find(
      resource => canonicalizeUrl(resource.resource) === targetCanonical,
    );

    if (!matchingResource) {
      return {
        found: false,
        error: `No discovery resource found for canonical URL: ${targetCanonical}`,
      };
    }

    const analysis = analyzeDiscoveryRefresh(matchingResource, targetCanonical);

    // Additional check for metadata mismatch if expected metadata provided
    if (expectedMetadata && analysis.severity !== "error") {
      const metadataKeys = Object.keys(expectedMetadata);
      const actualKeys = Object.keys(analysis.resource.metadata);

      const missingKeys = metadataKeys.filter(key => !actualKeys.includes(key));
      const extraKeys = actualKeys.filter(key => !metadataKeys.includes(key));

      if (missingKeys.length > 0) {
        analysis.issues.push(`Missing expected metadata keys: ${missingKeys.join(", ")}`);
        analysis.severity = "warning";
      }

      if (extraKeys.length > 0 && missingKeys.length === 0) {
        // Only report extra keys if we're not missing any (could be newer version)
        analysis.issues.push(`Unexpected metadata keys: ${extraKeys.join(", ")}`);
      }
    }

    return {
      found: true,
      analysis,
    };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Formats discovery refresh analysis results for console output.
 *
 * @param analysis - The analysis results to format
 * @returns Formatted string ready for console output
 */
export function formatAnalysisResults(analysis: DiscoveryRefreshAnalysis): string {
  const lines: string[] = [];

  lines.push(`=== Discovery Refresh Analysis ===`);
  lines.push(`Resource: ${analysis.resource.canonicalUrl}`);
  lines.push(
    `Last Updated: ${analysis.resource.lastUpdated.toISOString()} (${Math.round(analysis.resource.ageMs / 1000)}s ago)`,
  );
  lines.push(`Metadata Keys: ${Object.keys(analysis.resource.metadata).join(", ") || "(none)"}`);
  lines.push("");

  if (analysis.severity === "none") {
    lines.push("✅ No issues detected");
  } else {
    const icon = analysis.severity === "error" ? "❌" : "⚠️";
    lines.push(
      `${icon} ${analysis.severity.toUpperCase()}: ${analysis.issues.length} issue(s) found`,
    );
    lines.push("");

    lines.push("Issues:");
    analysis.issues.forEach(issue => lines.push(`  • ${issue}`));
    lines.push("");

    lines.push("Recommendations:");
    analysis.recommendations.forEach(rec => lines.push(`  • ${rec}`));
  }

  return lines.join("\n");
}

/**
 * CLI-style helper for debugging discovery refresh issues.
 *
 * Usage in scripts:
 * ```typescript
 * const client = new HTTPFacilitatorClient({ url: "https://api.cdp.coinbase.com/platform/v2/x402" });
 * const result = await debugDiscoveryRefresh(client, "https://my-api.com/endpoint");
 *
 * if (result.found && result.analysis) {
 * console.log(formatAnalysisResults(result.analysis));
 * } else {
 * console.error(result.error || "Resource not found");
 * }
 * ```
 *
 * @param facilitatorUrl - The x402 facilitator URL to query
 * @param resourceUrl - The resource URL to debug
 */
export async function cliDebugDiscovery(
  facilitatorUrl: string,
  resourceUrl: string,
): Promise<void> {
  try {
    const { HTTPFacilitatorClient } = await import("@x402/core/http");
    const client = new HTTPFacilitatorClient({ url: facilitatorUrl });

    console.log(`🔍 Debugging discovery refresh for: ${resourceUrl}`);
    console.log(`📡 Using facilitator: ${facilitatorUrl}`);
    console.log("");

    const result = await debugDiscoveryRefresh(client, resourceUrl);

    if (result.found && result.analysis) {
      console.log(formatAnalysisResults(result.analysis));
    } else {
      console.error("❌ Error:", result.error || "Resource not found in discovery");
    }
  } catch (error) {
    console.error("❌ Failed to debug discovery:", error);
  }
}
