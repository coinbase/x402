/**
 * Debugging utilities for Bazaar discovery refresh issues
 *
 * These utilities help diagnose problems with:
 * - Discovery resource metadata not refreshing after seller updates
 * - Stale canonical resource URLs in discovery responses
 * - Missing route information in bazaar search results
 */

import type { DiscoveryResource, ListDiscoveryResourcesParams, BazaarClientExtension } from "./facilitatorClient";
import type { HTTPFacilitatorClient } from "@x402/core/http";
import type { WithExtensions } from "../types";

/**
 * Information about a discovery resource at different points in time
 */
export interface DiscoveryResourceSnapshot {
  /** Timestamp when this snapshot was taken */
  timestamp: string;
  /** The discovery resource data */
  resource: DiscoveryResource;
  /** Additional debug info about the snapshot */
  debug?: {
    /** Whether this resource responds to live requests */
    isLive?: boolean;
    /** Response time for live check in ms */
    responseTimeMs?: number;
    /** Actual routes advertised by the live seller */
    liveRoutes?: string[];
    /** Whether the discovery metadata matches live seller state */
    isStale?: boolean;
  };
}

/**
 * Result of comparing discovery resource snapshots
 */
export interface DiscoveryComparisonResult {
  /** Whether the resources are identical */
  isIdentical: boolean;
  /** Fields that changed between snapshots */
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  /** Whether this looks like a stale cache issue */
  possibleStaleCache: boolean;
  /** Human-readable summary of changes */
  summary: string;
}

/**
 * Options for discovery refresh debugging
 */
export interface DiscoveryDebugOptions {
  /** Whether to perform live health checks on discovered resources */
  checkLiveStatus?: boolean;
  /** Timeout for live health checks in ms */
  healthCheckTimeoutMs?: number;
  /** Whether to detect potential staleness issues */
  detectStaleness?: boolean;
}

/**
 * Enhanced discovery client with debugging capabilities for tracking and analyzing
 * discovery resource states over time
 */
export class DiscoveryDebugClient {
  private snapshots: Map<string, DiscoveryResourceSnapshot[]> = new Map();

  /**
   * Creates a new discovery debug client
   *
   * @param client - The HTTP facilitator client with bazaar extension
   */
  constructor(private client: WithExtensions<HTTPFacilitatorClient, BazaarClientExtension>) {}

  /**
   * Take a snapshot of discovery resources matching the given filters
   *
   * @param params - Optional filtering and pagination parameters for discovery query
   * @param options - Optional debugging configuration options
   * @returns Promise resolving to array of discovery resource snapshots
   */
  async takeSnapshot(
    params?: ListDiscoveryResourcesParams,
    options?: DiscoveryDebugOptions,
  ): Promise<DiscoveryResourceSnapshot[]> {
    const response = await this.client.extensions?.discovery?.listResources?.(params);
    if (!response) {
      throw new Error("Client does not have bazaar discovery extension");
    }

    const timestamp = new Date().toISOString();
    const snapshots: DiscoveryResourceSnapshot[] = [];

    for (const resource of response.items) {
      let debug: DiscoveryResourceSnapshot["debug"] | undefined;

      if (options?.checkLiveStatus || options?.detectStaleness) {
        debug = await this.gatherDebugInfo(resource, options);
      }

      const snapshot: DiscoveryResourceSnapshot = {
        timestamp,
        resource,
        debug,
      };

      snapshots.push(snapshot);

      // Store in history
      const key = this.getResourceKey(resource);
      const history = this.snapshots.get(key) || [];
      history.push(snapshot);
      this.snapshots.set(key, history);
    }

    return snapshots;
  }

  /**
   * Compare two discovery resource snapshots to identify changes
   *
   * @param older - The older snapshot to compare from
   * @param newer - The newer snapshot to compare to
   * @returns Comparison result with detected changes and potential issues
   */
  compareSnapshots(
    older: DiscoveryResourceSnapshot,
    newer: DiscoveryResourceSnapshot,
  ): DiscoveryComparisonResult {
    const changes: DiscoveryComparisonResult["changes"] = [];

    // Compare basic fields
    const fields = ["resource", "type", "x402Version", "lastUpdated"] as const;
    for (const field of fields) {
      const oldVal = older.resource[field];
      const newVal = newer.resource[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    }

    // Compare metadata deeply
    if (JSON.stringify(older.resource.metadata) !== JSON.stringify(newer.resource.metadata)) {
      changes.push({
        field: "metadata",
        oldValue: older.resource.metadata,
        newValue: newer.resource.metadata,
      });
    }

    // Compare accepts array
    if (JSON.stringify(older.resource.accepts) !== JSON.stringify(newer.resource.accepts)) {
      changes.push({
        field: "accepts",
        oldValue: older.resource.accepts,
        newValue: newer.resource.accepts,
      });
    }

    const isIdentical = changes.length === 0;

    // Detect possible stale cache issues
    let possibleStaleCache = false;
    let summary = "";

    if (isIdentical) {
      summary = "No changes detected";
      // If debug info shows live routes don't match discovery, this might be stale
      if (newer.debug?.isStale) {
        possibleStaleCache = true;
        summary = "No discovery changes, but live seller state differs (possible stale cache)";
      }
    } else {
      summary = `${changes.length} fields changed: ${changes.map(c => c.field).join(", ")}`;

      // If lastUpdated didn't change but other fields did, cache might be stale
      const lastUpdatedChanged = changes.some(c => c.field === "lastUpdated");
      if (!lastUpdatedChanged && changes.length > 0) {
        possibleStaleCache = true;
        summary += " (lastUpdated unchanged - possible stale cache)";
      }
    }

    return {
      isIdentical,
      changes,
      possibleStaleCache,
      summary,
    };
  }

  /**
   * Get the snapshot history for a specific resource
   *
   * @param resourceKey - The resource key (type:url format)
   * @returns Array of snapshots for the resource in chronological order
   */
  getResourceHistory(resourceKey: string): DiscoveryResourceSnapshot[] {
    return this.snapshots.get(resourceKey) || [];
  }

  /**
   * Analyze a resource for potential refresh issues
   *
   * @param resourceUrl - The specific resource URL to analyze
   * @param options - Optional debugging configuration options
   * @returns Promise resolving to analysis results with snapshots, issues, and recommendations
   */
  async analyzeResource(
    resourceUrl: string,
    options?: DiscoveryDebugOptions,
  ): Promise<{
    snapshots: DiscoveryResourceSnapshot[];
    issues: string[];
    recommendations: string[];
  }> {
    // Take a fresh snapshot of just this resource
    const allSnapshots = await this.takeSnapshot({ limit: 100 }, options);
    const snapshots = allSnapshots.filter(s => s.resource.resource === resourceUrl);

    if (snapshots.length === 0) {
      return {
        snapshots: [],
        issues: ["Resource not found in discovery"],
        recommendations: ["Verify the resource URL is correct and the seller is registered"],
      };
    }

    const issues: string[] = [];
    const recommendations: string[] = [];
    const latest = snapshots[0];

    // Check for staleness indicators
    if (latest.debug?.isStale) {
      issues.push("Discovery metadata appears stale compared to live seller state");
      recommendations.push("Contact facilitator support to force a discovery refresh");
    }

    if (latest.debug?.responseTimeMs && latest.debug.responseTimeMs > 5000) {
      issues.push(`Slow response time (${latest.debug.responseTimeMs}ms) may affect discovery`);
      recommendations.push("Check seller server performance and network connectivity");
    }

    // Check history for patterns
    const key = this.getResourceKey(latest.resource);
    const history = this.getResourceHistory(key);

    if (history.length > 1) {
      const recent = history.slice(-5); // Last 5 snapshots
      const hasChanges = recent.some((snap, i) => {
        if (i === 0) return false;
        const comparison = this.compareSnapshots(recent[i - 1], snap);
        return !comparison.isIdentical;
      });

      if (!hasChanges && history.length > 1) {
        const age = Date.now() - Date.parse(history[0].timestamp);
        const ageHours = age / (1000 * 60 * 60);
        if (ageHours > 24) {
          issues.push(`No discovery updates detected in ${ageHours.toFixed(1)} hours`);
          recommendations.push("Verify seller is actively updating routes and metadata");
        }
      }
    }

    return { snapshots, issues, recommendations };
  }

  /**
   * Generate a debugging report for discovery refresh issues
   *
   * @returns Formatted text report summarizing all tracked resources and issues
   */
  generateReport(): string {
    const lines: string[] = [];
    lines.push("Discovery Refresh Debug Report");
    lines.push("============================");
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Tracked resources: ${this.snapshots.size}`);
    lines.push("");

    for (const [key, history] of this.snapshots.entries()) {
      lines.push(`Resource: ${key}`);
      lines.push(`Snapshots: ${history.length}`);

      if (history.length > 1) {
        const oldest = history[0];
        const newest = history[history.length - 1];
        const comparison = this.compareSnapshots(oldest, newest);

        lines.push(`Changes: ${comparison.summary}`);
        if (comparison.possibleStaleCache) {
          lines.push(`⚠️  POSSIBLE STALE CACHE DETECTED`);
        }
      }

      const latest = history[history.length - 1];
      if (latest.debug) {
        if (latest.debug.isLive !== undefined) {
          lines.push(`Live status: ${latest.debug.isLive ? "✅ Responsive" : "❌ Unresponsive"}`);
        }
        if (latest.debug.isStale) {
          lines.push(`Staleness: ⚠️  Discovery metadata appears stale`);
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Gather debug information for a discovery resource
   *
   * @param resource - The discovery resource to analyze
   * @param options - Debug options controlling what information to gather
   * @returns Promise resolving to debug information object
   */
  private async gatherDebugInfo(
    resource: DiscoveryResource,
    options?: DiscoveryDebugOptions,
  ): Promise<DiscoveryResourceSnapshot["debug"]> {
    const debug: DiscoveryResourceSnapshot["debug"] = {};

    if (options?.checkLiveStatus) {
      try {
        const startTime = Date.now();
        const response = await fetch(resource.resource, {
          method: "HEAD",
          signal: AbortSignal.timeout(options.healthCheckTimeoutMs || 5000),
        });
        debug.responseTimeMs = Date.now() - startTime;
        debug.isLive = response.status < 500; // Accept any non-server-error as "live"
      } catch {
        debug.isLive = false;
        debug.responseTimeMs = options.healthCheckTimeoutMs || 5000;
      }
    }

    if (options?.detectStaleness && debug.isLive) {
      // Try to detect staleness by checking if the resource appears to have different
      // routes than what's in discovery. This is a heuristic and might not always work.
      try {
        // For now, just flag as potentially stale if lastUpdated is very old
        const lastUpdated = Date.parse(resource.lastUpdated);
        const ageHours = (Date.now() - lastUpdated) / (1000 * 60 * 60);
        debug.isStale = ageHours > 72; // Consider stale if > 3 days old
      } catch {
        // Ignore staleness detection errors
      }
    }

    return debug;
  }

  /**
   * Generate a unique key for a discovery resource
   *
   * @param resource - The discovery resource to generate a key for
   * @returns Resource key in format "type:url"
   */
  private getResourceKey(resource: DiscoveryResource): string {
    return `${resource.type}:${resource.resource}`;
  }
}

/**
 * Utility function to quickly debug a discovery refresh issue
 *
 * @param client - HTTP facilitator client with bazaar extension
 * @param options - Debug configuration options
 * @param options.resourceUrl - Specific resource URL to debug (optional)
 * @param options.filters - Discovery query filters (optional)
 * @param options.checkLive - Whether to perform live health checks
 * @param options.timeoutMs - Timeout for health checks in milliseconds
 * @returns Promise resolving to debug report with snapshots, issues, and recommendations
 * @example
 * ```ts
 * const client = withBazaar(new HTTPFacilitatorClient());
 * const result = await debugDiscoveryRefresh(client, {
 *   resourceUrl: "https://api.example.com/search",
 *   checkLive: true,
 *   timeoutMs: 10000
 * });
 * console.log(result.report);
 * ```
 */
export async function debugDiscoveryRefresh(
  client: WithExtensions<HTTPFacilitatorClient, BazaarClientExtension>,
  options: {
    resourceUrl?: string;
    filters?: ListDiscoveryResourcesParams;
    checkLive?: boolean;
    timeoutMs?: number;
  },
): Promise<{
  snapshots: DiscoveryResourceSnapshot[];
  report: string;
  issues: string[];
  recommendations: string[];
}> {
  const debugClient = new DiscoveryDebugClient(client);

  const debugOptions: DiscoveryDebugOptions = {
    checkLiveStatus: options.checkLive,
    healthCheckTimeoutMs: options.timeoutMs,
    detectStaleness: true,
  };

  let snapshots: DiscoveryResourceSnapshot[];
  let issues: string[] = [];
  let recommendations: string[] = [];

  if (options.resourceUrl) {
    const analysis = await debugClient.analyzeResource(options.resourceUrl, debugOptions);
    snapshots = analysis.snapshots;
    issues = analysis.issues;
    recommendations = analysis.recommendations;
  } else {
    snapshots = await debugClient.takeSnapshot(options.filters, debugOptions);

    // Generate generic issues and recommendations
    const staleCount = snapshots.filter(s => s.debug?.isStale).length;
    const unresponsiveCount = snapshots.filter(s => s.debug?.isLive === false).length;

    if (staleCount > 0) {
      issues.push(`${staleCount} resources appear to have stale discovery metadata`);
      recommendations.push("Contact facilitator support for discovery cache refresh");
    }

    if (unresponsiveCount > 0) {
      issues.push(`${unresponsiveCount} resources are unresponsive`);
      recommendations.push("Check seller server health and network connectivity");
    }
  }

  const report = [
    "Discovery Refresh Debug Report",
    "============================",
    `Timestamp: ${new Date().toISOString()}`,
    `Resources checked: ${snapshots.length}`,
    "",
    "Issues:",
    ...issues.map(issue => `- ${issue}`),
    "",
    "Recommendations:",
    ...recommendations.map(rec => `- ${rec}`),
    "",
    "Detailed Results:",
    ...snapshots.map(snapshot => {
      const lines = [];
      lines.push(`Resource: ${snapshot.resource.resource}`);
      lines.push(`  Type: ${snapshot.resource.type}`);
      lines.push(`  Last Updated: ${snapshot.resource.lastUpdated}`);

      if (snapshot.debug) {
        if (snapshot.debug.isLive !== undefined) {
          lines.push(`  Live: ${snapshot.debug.isLive ? "✅" : "❌"}`);
        }
        if (snapshot.debug.responseTimeMs) {
          lines.push(`  Response Time: ${snapshot.debug.responseTimeMs}ms`);
        }
        if (snapshot.debug.isStale) {
          lines.push(`  Status: ⚠️ Potentially stale`);
        }
      }
      lines.push("");
      return lines.join("\n");
    }),
  ].join("\n");

  return { snapshots, report, issues, recommendations };
}
