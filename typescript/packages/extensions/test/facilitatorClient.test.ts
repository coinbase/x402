/**
 * Tests for Bazaar Client Extension - facilitatorClient
 *
 * Tests the client-side discovery types and withBazaar extension.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withBazaar,
  type DiscoveryResource,
  type DiscoveryResourcesResponse,
  type ListDiscoveryResourcesParams,
} from "../src/bazaar/facilitatorClient";
import { HTTPFacilitatorClient } from "@x402/core/http";

describe("Bazaar Client Extension - facilitatorClient", () => {
  describe("Type definitions", () => {
    it("DiscoveryResource should have correct shape with all required fields", () => {
      // Type-level validation - ensures the interface compiles with correct fields
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint",
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
        metadata: { category: "weather" },
      };

      expect(resource.resource).toBe("https://api.example.com/endpoint");
      expect(resource.type).toBe("http");
      expect(resource.x402Version).toBe(2);
      expect(resource.accepts).toHaveLength(1);
      expect(resource.lastUpdated).toBe("2024-01-01T00:00:00.000Z");
      expect(resource.metadata).toEqual({ category: "weather" });
    });

    it("DiscoveryResource should allow optional metadata", () => {
      const resource: DiscoveryResource = {
        resource: "https://api.example.com/endpoint",
        type: "http",
        x402Version: 1,
        accepts: [],
        lastUpdated: "2024-01-01T00:00:00.000Z",
        // metadata is optional
      };

      expect(resource.metadata).toBeUndefined();
    });

    it("DiscoveryResourcesResponse should have correct shape with pagination", () => {
      const response: DiscoveryResourcesResponse = {
        x402Version: 2,
        items: [
          {
            resource: "https://api.example.com/endpoint",
            type: "http",
            x402Version: 1,
            accepts: [],
            lastUpdated: "2024-01-01T00:00:00.000Z",
          },
        ],
        pagination: {
          limit: 20,
          offset: 0,
          total: 100,
        },
      };

      expect(response.x402Version).toBe(2);
      expect(response.items).toHaveLength(1);
      expect(response.pagination.limit).toBe(20);
      expect(response.pagination.offset).toBe(0);
      expect(response.pagination.total).toBe(100);
    });

    it("ListDiscoveryResourcesParams should accept optional parameters", () => {
      const params1: ListDiscoveryResourcesParams = {};
      const params2: ListDiscoveryResourcesParams = { type: "http" };
      const params3: ListDiscoveryResourcesParams = { type: "http", limit: 10, offset: 5 };

      expect(params1.type).toBeUndefined();
      expect(params2.type).toBe("http");
      expect(params3.limit).toBe(10);
      expect(params3.offset).toBe(5);
    });
  });

  describe("withBazaar", () => {
    let mockFetch: ReturnType<typeof vi.fn>;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("should extend client with discovery.listResources method", () => {
      const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
      });

      const extendedClient = withBazaar(facilitatorClient);

      expect(extendedClient.extensions).toBeDefined();
      expect(extendedClient.extensions.discovery).toBeDefined();
      expect(typeof extendedClient.extensions.discovery.listResources).toBe("function");
    });

    it("should preserve existing extensions when chaining", () => {
      const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
      });

      // Simulate a client with existing extensions
      const clientWithExtensions = facilitatorClient as typeof facilitatorClient & {
        extensions: { other: { someMethod: () => string } };
      };
      clientWithExtensions.extensions = {
        other: { someMethod: () => "test" },
      };

      const extendedClient = withBazaar(clientWithExtensions);

      // Should have both the existing and new extensions
      expect(extendedClient.extensions.discovery).toBeDefined();
      expect((extendedClient.extensions as { other?: unknown }).other).toBeDefined();
    });

    it("listResources should call correct endpoint with no params", async () => {
      const mockResponse: DiscoveryResourcesResponse = {
        x402Version: 2,
        items: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
      });
      const extendedClient = withBazaar(facilitatorClient);

      const result = await extendedClient.extensions.discovery.listResources();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://x402.org/facilitator/discovery/resources");
      expect(options.method).toBe("GET");
      expect(result).toEqual(mockResponse);
    });

    it("listResources should include query params when provided", async () => {
      const mockResponse: DiscoveryResourcesResponse = {
        x402Version: 2,
        items: [],
        pagination: { limit: 10, offset: 5, total: 100 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
      });
      const extendedClient = withBazaar(facilitatorClient);

      await extendedClient.extensions.discovery.listResources({
        type: "http",
        limit: 10,
        offset: 5,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("type=http");
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
    });

    it("listResources should throw error on non-ok response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });

      const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
      });
      const extendedClient = withBazaar(facilitatorClient);

      await expect(extendedClient.extensions.discovery.listResources()).rejects.toThrow(
        "Facilitator listDiscoveryResources failed (500)",
      );
    });

    it("listResources should return properly typed response matching CDP API", async () => {
      // Mock response matching actual CDP API structure
      const mockResponse: DiscoveryResourcesResponse = {
        x402Version: 1,
        items: [
          {
            resource: "https://x402.mode.network/ta/indicators",
            type: "http",
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "eip155:8453",
                asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                amount: "1000",
                payTo: "0xa2477E16dCB42E2AD80f03FE97D7F1a1646cd1c0",
                maxTimeoutSeconds: 60,
                extra: { name: "USD Coin", version: "2" },
              },
            ],
            lastUpdated: "2024-01-01T00:00:00.000Z",
            metadata: {},
          },
        ],
        pagination: {
          limit: 1,
          offset: 0,
          total: 12234,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const facilitatorClient = new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
      });
      const extendedClient = withBazaar(facilitatorClient);

      const result = await extendedClient.extensions.discovery.listResources({ limit: 1 });

      // Validate response structure matches our fixed types
      expect(result.x402Version).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].resource).toBe("https://x402.mode.network/ta/indicators");
      expect(result.items[0].type).toBe("http");
      expect(result.items[0].x402Version).toBe(1);
      expect(result.items[0].accepts).toHaveLength(1);
      expect(result.items[0].lastUpdated).toBe("2024-01-01T00:00:00.000Z");
      expect(result.pagination.total).toBe(12234);
    });
  });
});
