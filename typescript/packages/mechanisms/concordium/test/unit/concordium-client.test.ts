import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConcordiumClient } from "../../src";

const mockGrpcClient = {
  getBlockItemStatus: vi.fn(),
  invokeContract: vi.fn(),
};

vi.mock("@concordium/web-sdk/nodejs", () => ({
  ConcordiumGRPCNodeClient: vi.fn(() => mockGrpcClient),
  credentials: { createSsl: vi.fn(), createInsecure: vi.fn() },
}));

vi.mock("@concordium/web-sdk", () => ({
  TransactionHash: { fromHexString: vi.fn(h => h) },
  ContractAddress: { create: vi.fn((i, s) => ({ index: i, subindex: s })) },
  ReceiveName: { fromString: vi.fn(n => n) },
  Parameter: { fromBuffer: vi.fn(b => b) },
  CcdAmount: { toMicroCcd: vi.fn(a => a?.microCcdAmount ?? 0n) },
}));

vi.mock("../../src/config", () => ({
  getChainConfig: vi.fn(n =>
    n === "concordium-testnet" ? { grpcUrl: "grpc.testnet.concordium.com:20000" } : null,
  ),
}));

const mockCcdTransfer = (status: string, recipient: string, amount: bigint) => ({
  status,
  outcome: {
    summary: {
      sender: { address: "sender123" },
      transactionType: "transfer",
      transfer: { to: { address: recipient }, amount: { microCcdAmount: amount } },
    },
  },
});

const mockPltTransfer = (status: string, recipient: string, amount: bigint, asset: string) => ({
  status,
  outcome: {
    summary: {
      sender: { address: "sender123" },
      transactionType: "tokenUpdate",
      events: [
        {
          tag: "TokenTransfer",
          to: { address: { address: recipient } },
          amount: { value: amount },
          tokenId: { value: asset },
        },
      ],
    },
  },
});

describe("ConcordiumClient", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("fromNetwork", () => {
    it("creates client from valid network", () => {
      expect(ConcordiumClient.fromNetwork("concordium-testnet")).toBeInstanceOf(ConcordiumClient);
    });

    it("throws for unknown network", () => {
      expect(() => ConcordiumClient.fromNetwork("unknown")).toThrow("Unknown network");
    });
  });

  describe("getTransactionStatus", () => {
    it("returns null when not found", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(null);
      const client = new ConcordiumClient({ host: "localhost" });
      expect(await client.getTransactionStatus("a".repeat(64))).toBeNull();
    });

    it("returns CCD transfer data", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(
        mockCcdTransfer("finalized", "recipient456", 1000000n),
      );
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.getTransactionStatus("a".repeat(64));

      expect(result).toMatchObject({
        status: "finalized",
        recipient: "recipient456",
        amount: "1000000",
        asset: "",
      });
    });

    it("returns PLT transfer data", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(
        mockPltTransfer("finalized", "recipient456", 1000000n, "EURR"),
      );
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.getTransactionStatus("a".repeat(64));

      expect(result).toMatchObject({
        status: "finalized",
        recipient: "recipient456",
        amount: "1000000",
        asset: "EURR",
      });
    });
  });

  describe("verifyPayment", () => {
    it("returns valid for correct payment", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(
        mockCcdTransfer("finalized", "recipient456", 1000000n),
      );
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.verifyPayment("a".repeat(64), {
        recipient: "recipient456",
        minAmount: 1000000n,
      });

      expect(result.valid).toBe(true);
    });

    it("returns not_found when missing", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(null);
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.verifyPayment("a".repeat(64), {
        recipient: "recipient456",
        minAmount: 1000000n,
      });

      expect(result).toEqual({ valid: false, reason: "not_found" });
    });

    it("returns recipient_mismatch", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(
        mockCcdTransfer("finalized", "wrong", 1000000n),
      );
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.verifyPayment("a".repeat(64), {
        recipient: "expected",
        minAmount: 1000000n,
      });

      expect(result.reason).toBe("recipient_mismatch");
    });

    it("returns insufficient_amount", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(
        mockCcdTransfer("finalized", "recipient456", 500000n),
      );
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.verifyPayment("a".repeat(64), {
        recipient: "recipient456",
        minAmount: 1000000n,
      });

      expect(result.reason).toBe("insufficient_amount");
    });

    it("returns asset_mismatch", async () => {
      mockGrpcClient.getBlockItemStatus.mockResolvedValue(
        mockPltTransfer("finalized", "recipient456", 1000000n, "USDC"),
      );
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.verifyPayment("a".repeat(64), {
        recipient: "recipient456",
        minAmount: 1000000n,
        asset: "EURR",
      });

      expect(result.reason).toBe("asset_mismatch");
    });
  });

  describe("invokeContract", () => {
    it("returns success", async () => {
      mockGrpcClient.invokeContract.mockResolvedValue({
        tag: "success",
        returnValue: { buffer: new Uint8Array([1, 2, 3]).buffer },
      });
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.invokeContract({ index: 100n, subindex: 0n }, "contract.view");

      expect(result.success).toBe(true);
    });

    it("returns failure", async () => {
      mockGrpcClient.invokeContract.mockResolvedValue({ tag: "failure", reason: "Rejected" });
      const client = new ConcordiumClient({ host: "localhost" });
      const result = await client.invokeContract({ index: 100n, subindex: 0n }, "contract.fail");

      expect(result).toEqual({ success: false, error: "Rejected" });
    });
  });
});
