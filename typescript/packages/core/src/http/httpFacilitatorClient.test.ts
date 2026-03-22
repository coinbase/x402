import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { HTTPFacilitatorClient, FacilitatorResponseError } from "./httpFacilitatorClient";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("HTTPFacilitatorClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getSupported", () => {
    test("should handle redirects correctly", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      const supportedResponse = {
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
        extensions: [],
        signers: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: "https://www.x402.org/facilitator/supported", // Final URL after redirect
        text: () => Promise.resolve(JSON.stringify(supportedResponse)),
      } as Response);

      const result = await client.getSupported();

      expect(result).toEqual(supportedResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://x402.org/facilitator/supported",
        expect.objectContaining({
          method: "GET",
          redirect: "follow",
        }),
      );
    });

    test("should retry on network failures", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      // First two attempts fail with network errors
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Connection timeout"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                kinds: [],
                extensions: [],
                signers: {},
              }),
            ),
        } as Response);

      const result = await client.getSupported();

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("should throw FacilitatorResponseError on persistent network failures", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      // All attempts fail with network errors
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getSupported()).rejects.toThrow(FacilitatorResponseError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test("should retry on 429 rate limit errors", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      // First attempt returns 429, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve("Rate limited"),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                kinds: [],
                extensions: [],
                signers: {},
              }),
            ),
        } as Response);

      const result = await client.getSupported();

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("should throw FacilitatorResponseError on non-retryable HTTP errors", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      } as Response);

      await expect(client.getSupported()).rejects.toThrow(FacilitatorResponseError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should handle invalid JSON responses", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("invalid json"),
      } as Response);

      await expect(client.getSupported()).rejects.toThrow(FacilitatorResponseError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should handle malformed response schema", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              // Missing required fields
              notKinds: [],
            }),
          ),
      } as Response);

      await expect(client.getSupported()).rejects.toThrow(FacilitatorResponseError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("verify", () => {
    test("should handle redirects correctly", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      const verifyResponse = {
        isValid: true,
        payer: "0x123...",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(verifyResponse)),
      } as Response);

      const result = await client.verify(
        { x402Version: 2, scheme: "exact", data: {} },
        { scheme: "exact", network: "eip155:84532", payTo: "0x123...", amount: "0.001" },
      );

      expect(result).toEqual(verifyResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://x402.org/facilitator/verify",
        expect.objectContaining({
          method: "POST",
          redirect: "follow",
        }),
      );
    });
  });

  describe("settle", () => {
    test("should handle redirects correctly", async () => {
      const client = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

      const settleResponse = {
        success: true,
        transaction: "0xabc...",
        network: "eip155:84532",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(settleResponse)),
      } as Response);

      const result = await client.settle(
        { x402Version: 2, scheme: "exact", data: {} },
        { scheme: "exact", network: "eip155:84532", payTo: "0x123...", amount: "0.001" },
      );

      expect(result).toEqual(settleResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://x402.org/facilitator/settle",
        expect.objectContaining({
          method: "POST",
          redirect: "follow",
        }),
      );
    });
  });
});
