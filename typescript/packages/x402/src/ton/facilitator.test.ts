import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyTonPayment, verifyTonPaymentBatch, verifyTonPaymentWithRetry } from "./facilitator";
import type { TonRpcLike } from "./types";
import * as verifyModule from "./verify";

// Mock the verify module
vi.mock("./verify", () => ({
  verifyTONExact: vi.fn(),
}));

/**
 * Helper to create a mock RPC client.
 *
 * @param overrides - Partial implementation of TonRpcLike methods to override defaults
 * @returns A complete TonRpcLike mock with defaults plus overrides
 */
function makeRpcMock(overrides: Partial<TonRpcLike> = {}): TonRpcLike {
  const base: TonRpcLike = {
    getTxByHash: async () => null,
    findIncomingByMemo: async () => null,
    getJettonTransferTo: async () => null,
    getFinalityDepth: async () => 2,
  };
  return { ...base, ...overrides };
}

describe("TON Facilitator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyTonPayment", () => {
    it("should return success response when verification passes", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "abc123def456",
        explorerUrl: "https://tonviewer.com/transaction/abc123def456",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        memo: "x402:invoice-001",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
      });

      expect(response.success).toBe(true);
      expect(response.txHash).toBe("abc123def456");
      expect(response.explorerUrl).toBe("https://tonviewer.com/transaction/abc123def456");
      expect(response.network).toBe("ton:mainnet");
      expect(response.errorReason).toBeUndefined();
    });

    it("should return error response when verification fails", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: false,
        reason: "TX_NOT_FOUND",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        memo: "x402:not-found",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
      });

      expect(response.success).toBe(false);
      expect(response.errorReason).toBe("TX_NOT_FOUND");
      expect(response.network).toBe("ton:mainnet");
      expect(response.txHash).toBeUndefined();
      expect(response.explorerUrl).toBeUndefined();
    });

    it("should handle INVALID_MEMO error", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: false,
        reason: "INVALID_MEMO",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        memo: "invalid@memo",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
      });

      expect(response.success).toBe(false);
      expect(response.errorReason).toBe("INVALID_MEMO");
    });

    it("should handle EXPIRED error", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: false,
        reason: "EXPIRED",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        memo: "x402:expired",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
        validUntil: Date.now() - 10000, // Expired
      });

      expect(response.success).toBe(false);
      expect(response.errorReason).toBe("EXPIRED");
    });

    it("should handle REPLAY_DETECTED error", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: false,
        reason: "REPLAY_DETECTED",
      });

      const usedTxIds = new Set(["already_used_tx"]);
      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        txid: "already_used_tx",
        memo: "x402:replay",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
        usedTxIds,
      });

      expect(response.success).toBe(false);
      expect(response.errorReason).toBe("REPLAY_DETECTED");
    });

    it("should verify jetton payment", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "jetton_tx_123",
        explorerUrl: "https://tonviewer.com/transaction/jetton_tx_123",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        memo: "x402:jetton-payment",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: {
          kind: "jetton",
          master: "EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA",
          decimals: 6,
        },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
      });

      expect(response.success).toBe(true);
      expect(response.txHash).toBe("jetton_tx_123");
    });

    it("should work with testnet", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "testnet_tx",
        explorerUrl: "https://testnet.tonviewer.com/transaction/testnet_tx",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPayment({
        memo: "x402:testnet",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 500000n,
        network: "ton:testnet",
        rpc,
      });

      expect(response.success).toBe(true);
      expect(response.network).toBe("ton:testnet");
    });
  });

  describe("verifyTonPaymentBatch", () => {
    it("should verify multiple payments in parallel", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);

      // Mock three different verification results
      mockVerify
        .mockResolvedValueOnce({
          ok: true,
          txid: "tx1",
          explorerUrl: "https://tonviewer.com/transaction/tx1",
        })
        .mockResolvedValueOnce({
          ok: true,
          txid: "tx2",
          explorerUrl: "https://tonviewer.com/transaction/tx2",
        })
        .mockResolvedValueOnce({
          ok: false,
          reason: "TX_NOT_FOUND",
        });

      const rpc = makeRpcMock();
      const payments = [
        {
          memo: "x402:invoice-001",
          to: "UQA1",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet" as const,
          rpc,
        },
        {
          memo: "x402:invoice-002",
          to: "UQA2",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 2000000n,
          network: "ton:mainnet" as const,
          rpc,
        },
        {
          memo: "x402:invoice-003",
          to: "UQA3",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 3000000n,
          network: "ton:mainnet" as const,
          rpc,
        },
      ];

      const responses = await verifyTonPaymentBatch(payments);

      expect(responses).toHaveLength(3);
      expect(responses[0].success).toBe(true);
      expect(responses[0].txHash).toBe("tx1");
      expect(responses[1].success).toBe(true);
      expect(responses[1].txHash).toBe("tx2");
      expect(responses[2].success).toBe(false);
      expect(responses[2].errorReason).toBe("TX_NOT_FOUND");
    });

    it("should handle empty batch", async () => {
      const responses = await verifyTonPaymentBatch([]);
      expect(responses).toHaveLength(0);
    });

    it("should handle single payment batch", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "single_tx",
        explorerUrl: "https://tonviewer.com/transaction/single_tx",
      });

      const rpc = makeRpcMock();
      const responses = await verifyTonPaymentBatch([
        {
          memo: "x402:single",
          to: "UQA1",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
      ]);

      expect(responses).toHaveLength(1);
      expect(responses[0].success).toBe(true);
    });
  });

  describe("verifyTonPaymentWithRetry", () => {
    it("should succeed on first attempt", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "first_try_success",
        explorerUrl: "https://tonviewer.com/transaction/first_try_success",
      });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry({
        memo: "x402:first-try",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
      });

      expect(response.success).toBe(true);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it("should retry on TX_NOT_FOUND and eventually succeed", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);

      // Fail twice with TX_NOT_FOUND, then succeed
      mockVerify
        .mockResolvedValueOnce({ ok: false, reason: "TX_NOT_FOUND" })
        .mockResolvedValueOnce({ ok: false, reason: "TX_NOT_FOUND" })
        .mockResolvedValueOnce({
          ok: true,
          txid: "retry_success",
          explorerUrl: "https://tonviewer.com/transaction/retry_success",
        });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry(
        {
          memo: "x402:retry-test",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
        { maxRetries: 3, retryDelay: 10 }, // Short delay for testing
      );

      expect(response.success).toBe(true);
      expect(response.txHash).toBe("retry_success");
      expect(mockVerify).toHaveBeenCalledTimes(3);
    });

    it("should NOT retry on INVALID_MEMO (validation error)", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "INVALID_MEMO" });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry(
        {
          memo: "invalid@memo",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(response.success).toBe(false);
      expect(response.errorReason).toBe("INVALID_MEMO");
      expect(mockVerify).toHaveBeenCalledTimes(1); // Should NOT retry
    });

    it("should NOT retry on EXPIRED", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "EXPIRED" });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry(
        {
          memo: "x402:expired",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
          validUntil: Date.now() - 10000,
        },
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(response.success).toBe(false);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on AMOUNT_MISMATCH", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "AMOUNT_MISMATCH" });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry(
        {
          memo: "x402:wrong-amount",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(response.success).toBe(false);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it("should NOT retry on REPLAY_DETECTED", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "REPLAY_DETECTED" });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry(
        {
          memo: "x402:replay",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(response.success).toBe(false);
      expect(mockVerify).toHaveBeenCalledTimes(1);
    });

    it("should return last error after max retries", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "TX_NOT_FOUND" });

      const rpc = makeRpcMock();
      const response = await verifyTonPaymentWithRetry(
        {
          memo: "x402:never-found",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
        { maxRetries: 3, retryDelay: 10 },
      );

      expect(response.success).toBe(false);
      expect(response.errorReason).toBe("TX_NOT_FOUND");
      expect(mockVerify).toHaveBeenCalledTimes(3);
    });

    it("should use default retry options", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "TX_NOT_FOUND" });

      const rpc = makeRpcMock();
      const startTime = Date.now();

      await verifyTonPaymentWithRetry({
        memo: "x402:default-retry",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
      });

      const elapsed = Date.now() - startTime;

      // Should have retried 3 times (default)
      expect(mockVerify).toHaveBeenCalledTimes(3);

      // Should have waited ~4 seconds (2000ms * 2 delays)
      // Using loose check because of timing variability
      expect(elapsed).toBeGreaterThan(3500);
    });

    it("should handle custom retry options", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValue({ ok: false, reason: "TX_NOT_FOUND" });

      const rpc = makeRpcMock();
      await verifyTonPaymentWithRetry(
        {
          memo: "x402:custom-retry",
          to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
          asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
          amountAtomic: 1000000n,
          network: "ton:mainnet",
          rpc,
        },
        { maxRetries: 5, retryDelay: 100 },
      );

      expect(mockVerify).toHaveBeenCalledTimes(5);
    });
  });

  describe("integration scenarios", () => {
    it("should handle typical facilitator flow", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "facilitator_tx",
        explorerUrl: "https://tonviewer.com/transaction/facilitator_tx",
      });

      const usedTxIds = new Set<string>();
      const rpc = makeRpcMock();

      const response = await verifyTonPayment({
        memo: "x402:invoice-12345",
        to: "UQAKd9dE5QxdHkjS82BkaUH9jmz-wwSEv2hyEaazIjKuVSHJ",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 5000000n, // 0.005 TON
        network: "ton:mainnet",
        rpc,
        validUntil: Date.now() + 3600000, // 1 hour from now
        usedTxIds,
      });

      expect(response.success).toBe(true);
      expect(response.txHash).toBeDefined();
      expect(response.explorerUrl).toBeDefined();
    });

    it("should handle payment verification with replay protection", async () => {
      const mockVerify = vi.mocked(verifyModule.verifyTONExact);

      // First payment succeeds
      mockVerify.mockResolvedValueOnce({
        ok: true,
        txid: "payment_1",
        explorerUrl: "https://tonviewer.com/transaction/payment_1",
      });

      // Second payment with same txid fails (replay)
      mockVerify.mockResolvedValueOnce({
        ok: false,
        reason: "REPLAY_DETECTED",
      });

      const usedTxIds = new Set<string>();
      const rpc = makeRpcMock();

      // First payment
      const response1 = await verifyTonPayment({
        txid: "payment_1",
        memo: "x402:invoice-001",
        to: "UQA1",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 1000000n,
        network: "ton:mainnet",
        rpc,
        usedTxIds,
      });

      expect(response1.success).toBe(true);
      usedTxIds.add("payment_1"); // Mark as used

      // Try to reuse same transaction
      const response2 = await verifyTonPayment({
        txid: "payment_1",
        memo: "x402:invoice-002",
        to: "UQA2",
        asset: { kind: "native" as const, symbol: "TON" as const, decimals: 9 as const },
        amountAtomic: 2000000n,
        network: "ton:mainnet",
        rpc,
        usedTxIds,
      });

      expect(response2.success).toBe(false);
      expect(response2.errorReason).toBe("REPLAY_DETECTED");
    });
  });
});
