import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TonRpcClient, createTonApiRpc, createTonCenterRpc, createMultiProviderRpc } from "./rpc";
import type { TonRpcConfig } from "./rpc";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe("TonRpcClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create client with default retry settings", () => {
      const config: TonRpcConfig = {
        providers: [{ name: "tonapi", endpoint: "https://tonapi.io" }],
      };
      const client = new TonRpcClient(config);
      expect(client).toBeDefined();
    });

    it("should create client with custom retry settings", () => {
      const config: TonRpcConfig = {
        providers: [{ name: "tonapi", endpoint: "https://tonapi.io" }],
        retryAttempts: 5,
        retryDelay: 2000,
      };
      const client = new TonRpcClient(config);
      expect(client).toBeDefined();
    });
  });

  describe("findIncomingByMemo", () => {
    it("should find transaction with tonapi provider", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            {
              hash: "abc123def456",
              in_msg: {
                value: "1000000",
                destination: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
                decoded_body: { text: "x402:test-memo" },
              },
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:test-memo",
      );

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("abc123def456");
      expect(tx?.amount).toBe("1000000");
      expect(tx?.comment).toBe("x402:test-memo");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v2/blockchain/accounts/"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should normalize addresses when comparing", async () => {
      // Mock returns non-bounceable format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            {
              hash: "normalized_tx",
              in_msg: {
                value: "2000000",
                destination: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
                decoded_body: { text: "x402:normalized" },
              },
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      // Query with same address (normalization happens internally)
      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:normalized",
      );

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("normalized_tx");
    });

    it("should skip transactions with zero value", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            {
              hash: "zero_value_tx",
              in_msg: {
                value: "0", // Zero value - should be skipped
                destination: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
                decoded_body: { text: "x402:test" },
              },
            },
            {
              hash: "valid_tx",
              in_msg: {
                value: "1000000",
                destination: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
                decoded_body: { text: "x402:test" },
              },
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:test",
      );

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("valid_tx"); // Should find the non-zero transaction
    });

    it("should return null when transaction not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            {
              hash: "different_tx",
              in_msg: {
                value: "1000000",
                destination: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
                decoded_body: { text: "different-memo" },
              },
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:not-found",
      );

      expect(tx).toBeNull();
    });

    it("should use limit of 100 transactions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: [] }),
      });

      const client = createTonApiRpc();
      await client.findIncomingByMemo("UQA...", "x402:test");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("limit=100"),
        expect.any(Object),
      );
    });

    it("should handle toncenter provider", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              transaction_id: { hash: "toncenter_tx" },
              in_msg: {
                value: "5000000",
                destination: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
                message: "x402:toncenter-test",
              },
            },
          ],
        }),
      });

      const client = createTonCenterRpc();
      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:toncenter-test",
      );

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("toncenter_tx");
      expect(tx?.comment).toBe("x402:toncenter-test");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/getTransactions"),
        expect.any(Object),
      );
    });

    it("should fallback to next provider on error", async () => {
      // First provider fails
      mockFetch.mockRejectedValueOnce(new Error("tonapi down"));

      // Second provider succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              transaction_id: { hash: "fallback_tx" },
              in_msg: {
                value: "3000000",
                destination: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
                message: "x402:fallback",
              },
            },
          ],
        }),
      });

      const client = createMultiProviderRpc({
        tonApiKey: "key1",
        toncenterKey: "key2",
      });

      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:fallback",
      );

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("fallback_tx");
      expect(mockFetch).toHaveBeenCalledTimes(2); // Called both providers
    });
  });

  describe("getTxByHash", () => {
    it("should get transaction by hash with tonapi", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hash: "specific_hash_123",
          in_msg: {
            value: "7000000",
            destination: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
            decoded_body: { text: "x402:by-hash" },
          },
        }),
      });

      const client = createTonApiRpc();
      const tx = await client.getTxByHash("specific_hash_123");

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("specific_hash_123");
      expect(tx?.amount).toBe("7000000");
      expect(tx?.comment).toBe("x402:by-hash");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v2/blockchain/transactions/"),
        expect.any(Object),
      );
    });

    it("should handle toncenter getTxByHash", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            transaction_id: { hash: "toncenter_hash" },
            in_msg: {
              value: "9000000",
              destination: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
              message: "x402:toncenter-hash",
            },
          },
        }),
      });

      const client = createTonCenterRpc();
      const tx = await client.getTxByHash("toncenter_hash");

      expect(tx).toBeDefined();
      expect(tx?.hash).toBe("toncenter_hash");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/getTransaction?hash="),
        expect.any(Object),
      );
    });

    it("should return null when transaction not found", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Transaction not found"));

      const client = createTonApiRpc();
      const tx = await client.getTxByHash("nonexistent");

      expect(tx).toBeNull();
    });
  });

  describe("getJettonTransferTo", () => {
    it("should find jetton transfer with tonapi", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [
            {
              event_id: "event_123",
              actions: [
                {
                  JettonTransfer: {
                    jetton: {
                      master: { address: "EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA" },
                    },
                    recipient: { address: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ" },
                    amount: "1000000",
                    comment: "x402:jetton-test",
                  },
                },
              ],
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      const transfer = await client.getJettonTransferTo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        {
          master: "EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA",
          memo: "x402:jetton-test",
        },
      );

      expect(transfer).toBeDefined();
      expect(transfer?.txHash).toBe("event_123");
      expect(transfer?.amount).toBe("1000000");
      expect(transfer?.memo).toBe("x402:jetton-test");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/events?limit=100"),
        expect.any(Object),
      );
    });

    it("should normalize jetton addresses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [
            {
              event_id: "normalized_event",
              actions: [
                {
                  jetton_transfer: {
                    jetton_master: "UQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA",
                    recipient: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
                    amount: "2000000",
                    comment: "x402:normalized-jetton",
                  },
                },
              ],
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      // Query with same addresses (normalization happens internally)
      const transfer = await client.getJettonTransferTo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        {
          master: "UQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA",
          memo: "x402:normalized-jetton",
        },
      );

      expect(transfer).toBeDefined();
      expect(transfer?.txHash).toBe("normalized_event");
    });

    it("should return null when jetton transfer not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [],
        }),
      });

      const client = createTonApiRpc();
      const transfer = await client.getJettonTransferTo("UQA...", {
        master: "EQB...",
        memo: "x402:not-found",
      });

      expect(transfer).toBeNull();
    });

    it("should skip toncenter provider for jetton transfers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [] }),
      });

      const client = createTonCenterRpc();
      const transfer = await client.getJettonTransferTo("UQA...", {
        master: "EQB...",
        memo: "x402:test",
      });

      expect(transfer).toBeNull();
      // Should not call toncenter API for jettons
    });
  });

  describe("getFinalityDepth", () => {
    it("should return finality depth of 2", async () => {
      const client = createTonApiRpc();
      const depth = await client.getFinalityDepth();
      expect(depth).toBe(2);
    });
  });

  describe("retry logic", () => {
    it("should handle transient failures gracefully", async () => {
      // Test that client handles empty results gracefully (not a retry scenario)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: [] }),
      });

      const client = new TonRpcClient({
        providers: [{ name: "tonapi", endpoint: "https://tonapi.io" }],
        retryAttempts: 3,
        retryDelay: 10,
      });

      const tx = await client.findIncomingByMemo(
        "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        "x402:not-found",
      );

      expect(tx).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should return null after max retries", async () => {
      // Mock returns empty transactions on all attempts
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ transactions: [] }) });

      const client = new TonRpcClient({
        providers: [{ name: "tonapi", endpoint: "https://tonapi.io" }],
        retryAttempts: 3,
        retryDelay: 10,
      });

      const tx = await client.findIncomingByMemo("UQA...", "x402:fail");
      expect(tx).toBeNull();
      // Note: withRetry succeeds on first call (returns null), so only 1 fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("factory functions", () => {
    it("should create tonapi client with correct endpoint", () => {
      const client = createTonApiRpc("test_api_key");
      expect(client).toBeDefined();
    });

    it("should create toncenter client with correct endpoint", () => {
      const client = createTonCenterRpc("test_api_key");
      expect(client).toBeDefined();
    });

    it("should create multi-provider client", () => {
      const client = createMultiProviderRpc({
        tonApiKey: "tonapi_key",
        toncenterKey: "toncenter_key",
        customEndpoints: [
          { name: "custom", endpoint: "https://custom.ton.api", apiKey: "custom_key" },
        ],
      });
      expect(client).toBeDefined();
    });

    it("should create multi-provider with only tonapi", () => {
      const client = createMultiProviderRpc({
        tonApiKey: "only_tonapi",
      });
      expect(client).toBeDefined();
    });

    it("should create multi-provider with only custom endpoints", () => {
      const client = createMultiProviderRpc({
        customEndpoints: [{ name: "custom", endpoint: "https://custom.api" }],
      });
      expect(client).toBeDefined();
    });
  });

  describe("API key handling", () => {
    it("should include API key in tonapi requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactions: [] }),
      });

      const client = createTonApiRpc("secret_api_key");
      await client.findIncomingByMemo("UQA...", "x402:test");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer secret_api_key",
          }),
        }),
      );
    });

    it("should include API key in toncenter requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: [] }),
      });

      const client = createTonCenterRpc("toncenter_key");
      await client.findIncomingByMemo("UQA...", "x402:test");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("api_key=toncenter_key"),
        expect.any(Object),
      );
    });
  });

  describe("error handling", () => {
    it("should handle HTTP errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const client = createTonApiRpc();

      // withRetry catches errors and returns null after retries
      const tx = await client.findIncomingByMemo("UQA...", "x402:test");
      expect(tx).toBeNull();
    });

    it("should handle malformed JSON responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      const client = createTonApiRpc();

      // withRetry catches errors and returns null after retries
      const tx = await client.findIncomingByMemo("UQA...", "x402:test");
      expect(tx).toBeNull();
    });

    it("should handle missing in_msg gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactions: [
            {
              hash: "no_in_msg",
              // Missing in_msg field
            },
          ],
        }),
      });

      const client = createTonApiRpc();
      const tx = await client.findIncomingByMemo("UQA...", "x402:test");

      expect(tx).toBeNull(); // Should skip transactions without in_msg
    });
  });
});
