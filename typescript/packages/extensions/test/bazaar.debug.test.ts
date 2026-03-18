/**
 * Tests for Bazaar Discovery Debug Utilities
 */

import { describe, it, expect } from "vitest";
import {
  canonicalizeUrl,
  resourceToDebugInfo,
  analyzeDiscoveryRefresh,
  formatAnalysisResults,
  formatBatchAnalysisResults,
  type DiscoveryRefreshAnalysis,
  type DiscoveryBatchAnalysis,
} from "../src/bazaar/debug";
import type { DiscoveryResource } from "../src/bazaar/facilitatorClient";

describe("Bazaar Discovery Debug Utilities", () => {
  describe("canonicalizeUrl", () => {
    it("should remove query parameters", () => {
      const result = canonicalizeUrl("https://api.example.com/endpoint?query=test&limit=10");
      expect(result).toBe("https://api.example.com/endpoint");
    });

    it("should remove fragments", () => {
      const result = canonicalizeUrl("https://api.example.com/docs#section-1");
      expect(result).toBe("https://api.example.com/docs");
    });

    it("should remove both query parameters and fragments", () => {
      const result = canonicalizeUrl("https://api.example.com/page?foo=bar#anchor");
      expect(result).toBe("https://api.example.com/page");
    });

    it("should handle URLs without query params or fragments", () => {
      const result = canonicalizeUrl("https://api.example.com/clean");
      expect(result).toBe("https://api.example.com/clean");
    });

    it("should handle malformed URLs gracefully", () => {
      const result = canonicalizeUrl("not-a-url?query=test#fragment");
      expect(result).toBe("not-a-url");
    });

    it("should preserve path structure", () => {
      const result = canonicalizeUrl("https://api.example.com/v1/users/123?expand=profile");
      expect(result).toBe("https://api.example.com/v1/users/123");
    });
  });

  describe("resourceToDebugInfo", () => {
    it("should convert discovery resource to debug info", () => {
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint?query=test",
        type: "http",
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "10000",
            payTo: "0x1234567890123456789012345678901234567890",
            maxTimeoutSeconds: 60,
            extra: {},
          },
        ],
        lastUpdated: "2024-01-01T00:00:00.000Z",
        metadata: { category: "weather", version: "1.0" },
      };

      const debugInfo = resourceToDebugInfo(resource);

      expect(debugInfo.canonicalUrl).toBe("https://api.example.com/endpoint");
      expect(debugInfo.originalUrl).toBe("https://api.example.com/endpoint?query=test");
      expect(debugInfo.lastUpdated).toEqual(new Date("2024-01-01T00:00:00.000Z"));
      expect(debugInfo.ageMs).toBeGreaterThan(0);
      expect(debugInfo.metadata).toEqual({ category: "weather", version: "1.0" });
      expect(debugInfo.primaryPaymentRequirement).toEqual(resource.accepts[0]);
    });

    it("should handle resource without metadata", () => {
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/simple",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: "2024-01-01T00:00:00.000Z",
      };

      const debugInfo = resourceToDebugInfo(resource);

      expect(debugInfo.metadata).toEqual({});
      expect(debugInfo.primaryPaymentRequirement).toBeUndefined();
    });
  });

  describe("analyzeDiscoveryRefresh", () => {
    it("should detect no issues for fresh resource", () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: fiveMinutesAgo.toISOString(),
        metadata: { category: "weather" },
      };

      const analysis = analyzeDiscoveryRefresh(resource);

      expect(analysis.severity).toBe("none");
      expect(analysis.issues).toHaveLength(0);
      expect(analysis.recommendations).toHaveLength(0);
    });

    it("should detect stale resource (older than 1 hour)", () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: twoHoursAgo.toISOString(),
        metadata: { category: "weather" },
      };

      const analysis = analyzeDiscoveryRefresh(resource);

      expect(analysis.severity).toBe("warning");
      expect(analysis.issues[0]).toContain("Resource is stale: last updated 120 minutes ago");
      expect(analysis.recommendations[0]).toContain("discovery needs to refresh");
    });

    it("should detect extremely stale resource (older than 24 hours)", () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: twoDaysAgo.toISOString(),
        metadata: { category: "weather" },
      };

      const analysis = analyzeDiscoveryRefresh(resource);

      expect(analysis.severity).toBe("error");
      // Check for both stale and extremely stale messages
      expect(analysis.issues.some(issue => issue.includes("extremely stale"))).toBe(true);
      expect(analysis.issues.some(issue => issue.includes("48 hours ago"))).toBe(true);
    });

    it("should detect canonical URL mismatch", () => {
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/old-endpoint",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: new Date().toISOString(),
        metadata: { category: "weather" },
      };

      const analysis = analyzeDiscoveryRefresh(resource, "https://api.example.com/new-endpoint");

      expect(analysis.severity).toBe("error");
      expect(analysis.issues[0]).toEqual(
        "Canonical URL mismatch: discovery has 'https://api.example.com/old-endpoint', expected 'https://api.example.com/new-endpoint'",
      );
      expect(analysis.recommendations[0]).toEqual(
        "Verify the seller is advertising the expected primary route",
      );
    });

    it("should detect query parameters in stored URL", () => {
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint?query=test",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: new Date().toISOString(),
        metadata: { category: "weather" },
      };

      const analysis = analyzeDiscoveryRefresh(resource);

      expect(analysis.severity).toBe("warning");
      expect(analysis.issues[0]).toEqual(
        "Resource URL contains query parameters or fragments - should be canonicalized",
      );
      expect(analysis.recommendations[0]).toEqual(
        "Discovery system should canonicalize URLs before storage",
      );
    });

    it("should detect empty metadata", () => {
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: new Date().toISOString(),
      };

      const analysis = analyzeDiscoveryRefresh(resource);

      expect(analysis.severity).toBe("warning");
      expect(analysis.issues[0]).toEqual(
        "Resource metadata is empty - discovery may be incomplete",
      );
      expect(analysis.recommendations[0]).toEqual(
        "Check if the seller is properly advertising metadata via discovery extensions",
      );
    });

    it("should prioritize error severity over warning", () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint?query=test",
        type: "http",
        x402Version: 2,
        accepts: [],
        lastUpdated: twoDaysAgo.toISOString(),
      };

      const analysis = analyzeDiscoveryRefresh(resource);

      // Should be error due to extremely stale resource, not warning for query params
      expect(analysis.severity).toBe("error");
    });
  });

  describe("formatAnalysisResults", () => {
    it("should format analysis with no issues", () => {
      const analysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint",
          originalUrl: "https://api.example.com/endpoint",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 5000,
          metadata: { category: "weather" },
        },
        issues: [],
        recommendations: [],
        severity: "none",
      };

      const formatted = formatAnalysisResults(analysis);

      expect(formatted).toContain("=== Discovery Refresh Analysis ===");
      expect(formatted).toContain("https://api.example.com/endpoint");
      expect(formatted).toContain("✅ No issues detected");
      expect(formatted).toContain("Metadata Keys: category");
    });

    it("should format analysis with warning issues", () => {
      const analysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint",
          originalUrl: "https://api.example.com/endpoint?query=test",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 5000,
          metadata: {},
        },
        issues: ["Resource metadata is empty", "URL contains query parameters"],
        recommendations: ["Check discovery extensions", "Canonicalize URLs"],
        severity: "warning",
      };

      const formatted = formatAnalysisResults(analysis);

      expect(formatted).toContain("⚠️ WARNING: 2 issue(s) found");
      expect(formatted).toContain("• Resource metadata is empty");
      expect(formatted).toContain("• URL contains query parameters");
      expect(formatted).toContain("• Check discovery extensions");
      expect(formatted).toContain("• Canonicalize URLs");
      expect(formatted).toContain("Metadata Keys: (none)");
    });

    it("should format analysis with error issues", () => {
      const analysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint",
          originalUrl: "https://api.example.com/old-endpoint",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 5000,
          metadata: { version: "1.0" },
        },
        issues: ["Canonical URL mismatch"],
        recommendations: ["Check primary route"],
        severity: "error",
      };

      const formatted = formatAnalysisResults(analysis);

      expect(formatted).toContain("❌ ERROR: 1 issue(s) found");
      expect(formatted).toContain("• Canonical URL mismatch");
      expect(formatted).toContain("• Check primary route");
    });

    it("should show age in seconds when recent", () => {
      const analysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint",
          originalUrl: "https://api.example.com/endpoint",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 30000, // 30 seconds
          metadata: {},
        },
        issues: [],
        recommendations: [],
        severity: "none",
      };

      const formatted = formatAnalysisResults(analysis);

      expect(formatted).toContain("(30s ago)");
    });
  });
});

describe("Edge Cases", () => {
  it("should handle resource with no accepts array", () => {
    const resource: DiscoveryResource = {
      resource: "https://api.example.com/endpoint",
      type: "http",
      x402Version: 2,
      accepts: [],
      lastUpdated: new Date().toISOString(),
    };

    const debugInfo = resourceToDebugInfo(resource);
    expect(debugInfo.primaryPaymentRequirement).toBeUndefined();
  });

  it("should handle future lastUpdated timestamp", () => {
    const futureDate = new Date(Date.now() + 60000); // 1 minute in future

    const resource: DiscoveryResource = {
      resource: "https://api.example.com/endpoint",
      type: "http",
      x402Version: 2,
      accepts: [],
      lastUpdated: futureDate.toISOString(),
      metadata: { category: "test" }, // Include metadata to avoid empty metadata warning
    };

    const debugInfo = resourceToDebugInfo(resource);
    // Age should be negative for future timestamps
    expect(debugInfo.ageMs).toBeLessThan(0);

    const analysis = analyzeDiscoveryRefresh(resource);
    // Future timestamps shouldn't trigger stale warnings
    expect(analysis.severity).toBe("none");
  });
});

describe("Batch Discovery Analysis", () => {
  describe("formatBatchAnalysisResults", () => {
    it("should format batch analysis with no issues", () => {
      const batchAnalysis: DiscoveryBatchAnalysis = {
        totalResources: 3,
        healthyResources: 3,
        warningResources: 0,
        errorResources: 0,
        analyses: [], // No analyses when all healthy and includeHealthyDetails=false
      };

      const formatted = formatBatchAnalysisResults(batchAnalysis);

      expect(formatted).toContain("=== Batch Discovery Analysis ===");
      expect(formatted).toContain("📊 Total Resources: 3");
      expect(formatted).toContain("✅ Healthy: 3");
      expect(formatted).toContain("⚠️  Warnings: 0");
      expect(formatted).toContain("❌ Errors: 0");
      expect(formatted).toContain("🎉 All resources are healthy!");
    });

    it("should format batch analysis with mixed issues", () => {
      const mockAnalysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint1",
          originalUrl: "https://api.example.com/endpoint1",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 5000,
          metadata: {},
        },
        issues: ["Resource metadata is empty"],
        recommendations: ["Check discovery extensions"],
        severity: "warning",
      };

      const batchAnalysis: DiscoveryBatchAnalysis = {
        totalResources: 4,
        healthyResources: 1,
        warningResources: 2,
        errorResources: 1,
        analyses: [
          {
            url: "https://api.example.com/endpoint1",
            result: mockAnalysis,
          },
          {
            url: "https://api.example.com/endpoint2",
            result: null,
            error: "Not found in discovery",
          },
          {
            url: "https://api.example.com/endpoint3",
            result: {
              ...mockAnalysis,
              resource: {
                ...mockAnalysis.resource,
                canonicalUrl: "https://api.example.com/endpoint3",
              },
              issues: ["Canonical URL mismatch"],
              severity: "error",
            },
          },
        ],
      };

      const formatted = formatBatchAnalysisResults(batchAnalysis);

      expect(formatted).toContain("=== Batch Discovery Analysis ===");
      expect(formatted).toContain("📊 Total Resources: 4");
      expect(formatted).toContain("✅ Healthy: 1");
      expect(formatted).toContain("⚠️  Warnings: 2");
      expect(formatted).toContain("❌ Errors: 1");
      expect(formatted).toContain("=== Issues Found ===");
      expect(formatted).toContain("🔗 https://api.example.com/endpoint1");
      expect(formatted).toContain("⚠️ WARNING: 1 issue(s)");
      expect(formatted).toContain("• Resource metadata is empty");
      expect(formatted).toContain("🔗 https://api.example.com/endpoint2");
      expect(formatted).toContain("❌ Not found in discovery");
      expect(formatted).toContain("🔗 https://api.example.com/endpoint3");
      expect(formatted).toContain("❌ ERROR: 1 issue(s)");
      expect(formatted).toContain("• Canonical URL mismatch");
    });

    it("should handle analysis with no result but no error", () => {
      const batchAnalysis: DiscoveryBatchAnalysis = {
        totalResources: 1,
        healthyResources: 0,
        warningResources: 0,
        errorResources: 1,
        analyses: [
          {
            url: "https://api.example.com/endpoint",
            result: null,
          },
        ],
      };

      const formatted = formatBatchAnalysisResults(batchAnalysis);

      expect(formatted).toContain("🔗 https://api.example.com/endpoint");
      expect(formatted).toContain("❌ No analysis result");
    });

    it("should include recommendations when available", () => {
      const mockAnalysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint",
          originalUrl: "https://api.example.com/endpoint",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 5000,
          metadata: {},
        },
        issues: ["Resource metadata is empty"],
        recommendations: ["Check discovery extensions", "Verify seller configuration"],
        severity: "warning",
      };

      const batchAnalysis: DiscoveryBatchAnalysis = {
        totalResources: 1,
        healthyResources: 0,
        warningResources: 1,
        errorResources: 0,
        analyses: [
          {
            url: "https://api.example.com/endpoint",
            result: mockAnalysis,
          },
        ],
      };

      const formatted = formatBatchAnalysisResults(batchAnalysis);

      expect(formatted).toContain("Recommendations:");
      expect(formatted).toContain("• Check discovery extensions");
      expect(formatted).toContain("• Verify seller configuration");
    });

    it("should not show recommendations section when none available", () => {
      const mockAnalysis: DiscoveryRefreshAnalysis = {
        resource: {
          canonicalUrl: "https://api.example.com/endpoint",
          originalUrl: "https://api.example.com/endpoint",
          lastUpdated: new Date("2024-01-01T00:00:00.000Z"),
          ageMs: 5000,
          metadata: {},
        },
        issues: ["Some issue"],
        recommendations: [], // No recommendations
        severity: "warning",
      };

      const batchAnalysis: DiscoveryBatchAnalysis = {
        totalResources: 1,
        healthyResources: 0,
        warningResources: 1,
        errorResources: 0,
        analyses: [
          {
            url: "https://api.example.com/endpoint",
            result: mockAnalysis,
          },
        ],
      };

      const formatted = formatBatchAnalysisResults(batchAnalysis);

      expect(formatted).not.toContain("Recommendations:");
    });
  });
});
