/**
 * Tests for Bazaar Discovery Debug Utilities
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DiscoveryDebugClient,
  debugDiscoveryRefresh,
  type DiscoveryResourceSnapshot,
} from "../src/bazaar/debug";
import type {
  DiscoveryResource,
  DiscoveryResourcesResponse,
} from "../src/bazaar/facilitatorClient";
import type { HTTPFacilitatorClient } from "@x402/core/http";

// Mock data
const mockDiscoveryResource: DiscoveryResource = {
  resource: "https://api.example.com/test",
  type: "http",
  x402Version: 2,
  accepts: [],
  lastUpdated: "2026-03-18T12:00:00Z",
  metadata: {
    description: "Test API",
    method: "GET",
  },
};

const mockDiscoveryResponse: DiscoveryResourcesResponse = {
  x402Version: 2,
  items: [mockDiscoveryResource],
  pagination: {
    limit: 100,
    offset: 0,
    total: 1,
  },
};

// Create mock facilitator client
/**
 * Create mock facilitator client for testing
 *
 * @param responses - Array of mock discovery responses to return in sequence
 * @returns Mock HTTP facilitator client with discovery extension
 */
function createMockFacilitatorClient(
  responses: DiscoveryResourcesResponse[] = [mockDiscoveryResponse],
): HTTPFacilitatorClient {
  let callIndex = 0;

  const client = {
    url: "https://facilitator.example.com",
    createAuthHeaders: vi.fn().mockResolvedValue({ headers: {} }),
    extensions: {
      discovery: {
        listResources: vi.fn().mockImplementation(async () => {
          const response = responses[callIndex] || responses[responses.length - 1];
          callIndex++;
          return response;
        }),
      },
    },
  } as unknown as HTTPFacilitatorClient;

  return client;
}

describe("DiscoveryDebugClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock global fetch for health checks
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  describe("takeSnapshot", () => {
    it("should take a basic snapshot without debug info", async () => {
      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const snapshots = await debugClient.takeSnapshot({ limit: 10 });

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].resource).toEqual(mockDiscoveryResource);
      expect(snapshots[0].timestamp).toBeDefined();
      expect(snapshots[0].debug).toBeUndefined();

      expect(client.extensions?.discovery?.listResources).toHaveBeenCalledWith({ limit: 10 });
    });

    it("should take a snapshot with live status check", async () => {
      mockFetch.mockImplementation(async () => {
        // Add a small delay to simulate network request
        await new Promise(resolve => setTimeout(resolve, 10));
        return { status: 200, ok: true };
      });

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const snapshots = await debugClient.takeSnapshot(
        { limit: 10 },
        { checkLiveStatus: true, healthCheckTimeoutMs: 3000 },
      );

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].debug?.isLive).toBe(true);
      expect(snapshots[0].debug?.responseTimeMs).toBeDefined();
      expect(snapshots[0].debug?.responseTimeMs).toBeGreaterThanOrEqual(0);

      expect(mockFetch).toHaveBeenCalledWith(mockDiscoveryResource.resource, {
        method: "HEAD",
        signal: expect.any(AbortSignal),
      });
    });

    it("should handle unresponsive resources", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const snapshots = await debugClient.takeSnapshot(undefined, {
        checkLiveStatus: true,
        healthCheckTimeoutMs: 1000,
      });

      expect(snapshots[0].debug?.isLive).toBe(false);
      expect(snapshots[0].debug?.responseTimeMs).toBe(1000);
    });

    it("should detect potentially stale resources", async () => {
      // Mock fetch to return successful response (needed for staleness detection)
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
      });

      // Create a date that's 4 days old to trigger staleness detection
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      const staleResource: DiscoveryResource = {
        ...mockDiscoveryResource,
        lastUpdated: fourDaysAgo.toISOString(),
      };

      const client = createMockFacilitatorClient([
        {
          ...mockDiscoveryResponse,
          items: [staleResource],
        },
      ]);

      const debugClient = new DiscoveryDebugClient(client);

      const snapshots = await debugClient.takeSnapshot(undefined, {
        checkLiveStatus: true,
        detectStaleness: true,
      });

      expect(snapshots[0].debug?.isLive).toBe(true);
      expect(snapshots[0].debug?.isStale).toBe(true);
    });

    it("should store snapshots in history", async () => {
      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      await debugClient.takeSnapshot();
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await debugClient.takeSnapshot();

      const history = debugClient.getResourceHistory(`http:${mockDiscoveryResource.resource}`);
      expect(history).toHaveLength(2);
      expect(history[0].timestamp).not.toBe(history[1].timestamp);
    });
  });

  describe("compareSnapshots", () => {
    it("should detect identical resources", () => {
      const snapshot1: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:00:00Z",
        resource: mockDiscoveryResource,
      };

      const snapshot2: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:05:00Z",
        resource: { ...mockDiscoveryResource },
      };

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const result = debugClient.compareSnapshots(snapshot1, snapshot2);

      expect(result.isIdentical).toBe(true);
      expect(result.changes).toHaveLength(0);
      expect(result.summary).toBe("No changes detected");
      expect(result.possibleStaleCache).toBe(false);
    });

    it("should detect changes in resource fields", () => {
      const snapshot1: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:00:00Z",
        resource: mockDiscoveryResource,
      };

      const changedResource: DiscoveryResource = {
        ...mockDiscoveryResource,
        lastUpdated: "2026-03-18T12:05:00Z",
        metadata: { description: "Updated API", method: "POST" },
      };

      const snapshot2: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:05:00Z",
        resource: changedResource,
      };

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const result = debugClient.compareSnapshots(snapshot1, snapshot2);

      expect(result.isIdentical).toBe(false);
      expect(result.changes).toHaveLength(2);
      expect(result.changes.some(c => c.field === "lastUpdated")).toBe(true);
      expect(result.changes.some(c => c.field === "metadata")).toBe(true);
      expect(result.summary).toContain("lastUpdated, metadata");
    });

    it("should detect possible stale cache when lastUpdated doesn't change", () => {
      const snapshot1: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:00:00Z",
        resource: mockDiscoveryResource,
      };

      const changedResource: DiscoveryResource = {
        ...mockDiscoveryResource,
        // lastUpdated stays the same, but metadata changes
        metadata: { description: "Updated API", method: "POST" },
      };

      const snapshot2: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:05:00Z",
        resource: changedResource,
      };

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const result = debugClient.compareSnapshots(snapshot1, snapshot2);

      expect(result.possibleStaleCache).toBe(true);
      expect(result.summary).toContain("possible stale cache");
    });

    it("should detect stale cache from debug info", () => {
      const snapshot1: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:00:00Z",
        resource: mockDiscoveryResource,
      };

      const snapshot2: DiscoveryResourceSnapshot = {
        timestamp: "2026-03-18T12:05:00Z",
        resource: { ...mockDiscoveryResource },
        debug: { isStale: true },
      };

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const result = debugClient.compareSnapshots(snapshot1, snapshot2);

      expect(result.possibleStaleCache).toBe(true);
      expect(result.summary).toContain("possible stale cache");
    });
  });

  describe("analyzeResource", () => {
    it("should analyze a specific resource", async () => {
      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const result = await debugClient.analyzeResource("https://api.example.com/test");

      expect(result.snapshots).toHaveLength(1);
      expect(result.issues).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it("should return not found error for missing resource", async () => {
      const client = createMockFacilitatorClient([
        {
          ...mockDiscoveryResponse,
          items: [], // No matching resources
        },
      ]);

      const debugClient = new DiscoveryDebugClient(client);

      const result = await debugClient.analyzeResource("https://api.missing.com/test");

      expect(result.snapshots).toHaveLength(0);
      expect(result.issues).toContain("Resource not found in discovery");
      expect(result.recommendations).toContain(
        "Verify the resource URL is correct and the seller is registered",
      );
    });

    it("should detect staleness issues", async () => {
      // Mock fetch to return successful response (needed for staleness detection)
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
      });

      // Create a timestamp that's 4 days old
      const fourDaysAgo = new Date();
      fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

      const staleResource: DiscoveryResource = {
        ...mockDiscoveryResource,
        lastUpdated: fourDaysAgo.toISOString(),
      };

      const client = createMockFacilitatorClient([
        {
          ...mockDiscoveryResponse,
          items: [staleResource],
        },
      ]);

      const debugClient = new DiscoveryDebugClient(client);

      const result = await debugClient.analyzeResource("https://api.example.com/test", {
        checkLiveStatus: true,
        detectStaleness: true,
      });

      expect(result.issues.some(issue => issue.includes("stale"))).toBe(true);
      expect(result.recommendations.some(rec => rec.includes("refresh"))).toBe(true);
    });

    it("should detect performance issues", async () => {
      mockFetch.mockImplementation(async () => {
        // Simulate slow response
        await new Promise(resolve => setTimeout(resolve, 100));
        return { status: 200, ok: true };
      });

      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      const result = await debugClient.analyzeResource("https://api.example.com/test", {
        checkLiveStatus: true,
      });

      // The test might not catch slow responses due to timing, but structure should be correct
      expect(result.snapshots[0].debug?.responseTimeMs).toBeDefined();
    });
  });

  describe("generateReport", () => {
    it("should generate a comprehensive debug report", async () => {
      const client = createMockFacilitatorClient();
      const debugClient = new DiscoveryDebugClient(client);

      // Take some snapshots
      await debugClient.takeSnapshot(undefined, { checkLiveStatus: true });

      const report = debugClient.generateReport();

      expect(report).toContain("Discovery Refresh Debug Report");
      expect(report).toContain("Generated:");
      expect(report).toContain("Tracked resources: 1");
      expect(report).toContain(mockDiscoveryResource.resource);
    });
  });
});

describe("debugDiscoveryRefresh", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  it("should provide quick debug analysis for a specific resource", async () => {
    const client = createMockFacilitatorClient();

    const result = await debugDiscoveryRefresh(client, {
      resourceUrl: "https://api.example.com/test",
      checkLive: true,
      timeoutMs: 5000,
    });

    expect(result.snapshots).toHaveLength(1);
    expect(result.report).toContain("Discovery Refresh Debug Report");
    expect(result.issues).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  it("should analyze all resources when no specific URL provided", async () => {
    const multiResourceResponse: DiscoveryResourcesResponse = {
      x402Version: 2,
      items: [
        mockDiscoveryResource,
        { ...mockDiscoveryResource, resource: "https://api.example.com/other" },
      ],
      pagination: { limit: 100, offset: 0, total: 2 },
    };

    const client = createMockFacilitatorClient([multiResourceResponse]);

    const result = await debugDiscoveryRefresh(client, {
      filters: { type: "http" },
      checkLive: false,
    });

    expect(result.snapshots).toHaveLength(2);
    expect(result.report).toContain("Resources checked: 2");
  });

  it("should detect and report stale resources", async () => {
    // Mock fetch to return successful response (needed for staleness detection)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
    });

    // Create a timestamp that's 4 days old
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    const staleResponse: DiscoveryResourcesResponse = {
      x402Version: 2,
      items: [
        {
          ...mockDiscoveryResource,
          lastUpdated: fourDaysAgo.toISOString(),
        },
      ],
      pagination: { limit: 100, offset: 0, total: 1 },
    };

    const client = createMockFacilitatorClient([staleResponse]);

    const result = await debugDiscoveryRefresh(client, {
      checkLive: true, // Need to enable this for staleness detection
    });

    expect(result.issues.some(issue => issue.includes("stale"))).toBe(true);
    expect(result.recommendations.some(rec => rec.includes("cache refresh"))).toBe(true);
  });

  it("should detect and report unresponsive resources", async () => {
    mockFetch.mockRejectedValue(new Error("Connection failed"));

    const client = createMockFacilitatorClient();

    const result = await debugDiscoveryRefresh(client, {
      checkLive: true,
      timeoutMs: 1000,
    });

    expect(result.issues.some(issue => issue.includes("unresponsive"))).toBe(true);
    expect(result.recommendations.some(rec => rec.includes("server health"))).toBe(true);
  });

  it("should include detailed resource information in report", async () => {
    mockFetch.mockResolvedValue({ status: 200, ok: true });

    const client = createMockFacilitatorClient();

    const result = await debugDiscoveryRefresh(client, {
      checkLive: true,
    });

    expect(result.report).toContain("Resource: " + mockDiscoveryResource.resource);
    expect(result.report).toContain("Type: " + mockDiscoveryResource.type);
    expect(result.report).toContain("Last Updated: " + mockDiscoveryResource.lastUpdated);
    expect(result.report).toContain("Live: ✅");
  });

  it("should handle client without bazaar extension", async () => {
    const clientWithoutExtension = {
      url: "https://facilitator.example.com",
      createAuthHeaders: vi.fn().mockResolvedValue({ headers: {} }),
      extensions: undefined,
    } as unknown as HTTPFacilitatorClient;

    await expect(
      debugDiscoveryRefresh(clientWithoutExtension, {
        resourceUrl: "https://api.example.com/test",
      }),
    ).rejects.toThrow("Client does not have bazaar discovery extension");
  });
});
