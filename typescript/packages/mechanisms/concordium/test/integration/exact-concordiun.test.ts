import { describe, it, expect, vi } from "vitest";
import { Network, PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactConcordiumScheme } from "../../src/exact/facilitator";

const TESTNET = "ccd:4221332d34e1694168c2a0c0b3fd0f27";
const MAINNET = "ccd:9dd9ca4d19e9393877d2c44b70f89acb";
const CLIENT_ADDRESS = "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN";
const MERCHANT_ADDRESS = "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW";

const createMockClient = (txMap: Map<string, any>) => ({
  waitForFinalization: vi.fn().mockImplementation((txHash: string) => {
    return Promise.resolve(txMap.get(txHash) ?? null);
  }),
});

const createPayload = (
  txHash: string,
  network: Network = TESTNET,
  overrides: Partial<PaymentPayload["accepted"]> = {},
): PaymentPayload => ({
  x402Version: 2,
  payload: { txHash, sender: CLIENT_ADDRESS },
  accepted: {
    scheme: "exact",
    network,
    amount: "1000000",
    asset: "",
    payTo: MERCHANT_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: {},
    ...overrides,
  },
  resource: { url: "", description: "", mimeType: "" },
});

const createRequirements = (
  network: Network = TESTNET,
  overrides: Partial<PaymentRequirements> = {},
): PaymentRequirements => ({
  scheme: "exact",
  network,
  amount: "1000000",
  asset: "",
  payTo: MERCHANT_ADDRESS,
  maxTimeoutSeconds: 300,
  extra: {},
  ...overrides,
});

const createTxInfo = (txHash: string, overrides: Record<string, any> = {}) => ({
  txHash,
  status: "finalized",
  sender: CLIENT_ADDRESS,
  recipient: MERCHANT_ADDRESS,
  amount: "1000000",
  asset: "",
  ...overrides,
});

describe("Concordium Integration", () => {
  describe("Native CCD Payments", () => {
    it("completes full verify → settle flow", async () => {
      const txHash = "ccd-tx-123";
      const mockClient = createMockClient(new Map([[txHash, createTxInfo(txHash)]]));
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload = createPayload(txHash);
      const requirements = createRequirements();

      // Verify (checks payload structure)
      const verifyResult = await scheme.verify(payload, requirements);
      expect(verifyResult.isValid).toBe(true);
      expect(verifyResult.payer).toBe(CLIENT_ADDRESS);

      // Settle (validates on-chain)
      const settleResult = await scheme.settle(payload, requirements);
      expect(settleResult.success).toBe(true);
      expect(settleResult.transaction).toBe(txHash);
      expect(settleResult.payer).toBe(CLIENT_ADDRESS);
    });
  });

  describe("Payment Validation (settle)", () => {
    it("rejects insufficient amount", async () => {
      const txHash = "tx-low-amount";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { amount: "500000" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload(txHash), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("insufficient_amount");
    });

    it("rejects wrong recipient", async () => {
      const txHash = "tx-wrong-recipient";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { recipient: "WrongAddress" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload(txHash), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("recipient_mismatch");
    });

    it("rejects wrong asset", async () => {
      const txHash = "tx-wrong-asset";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { asset: "EURR" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload(txHash), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("asset_mismatch");
    });

    it("rejects failed transaction", async () => {
      const txHash = "tx-failed";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { status: "failed" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload(txHash), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("transaction_failed");
    });

    it("rejects transaction not found", async () => {
      const mockClient = createMockClient(new Map());
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload("missing-tx"), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("transaction_not_found");
    });

    it("rejects sender mismatch", async () => {
      const txHash = "tx-wrong-sender";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { sender: "DifferentSender" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload(txHash), createRequirements());

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("sender_mismatch");
    });

    it("accepts amount greater than required", async () => {
      const txHash = "tx-overpay";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { amount: "2000000" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const result = await scheme.settle(createPayload(txHash), createRequirements());

      expect(result.success).toBe(true);
    });
  });

  describe("PLT Token Payments", () => {
    it("verifies PLT token payment", async () => {
      const txHash = "plt-tx";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { amount: "1000000", asset: "EURR" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload = createPayload(txHash, TESTNET, { asset: "EURR" });
      const requirements = createRequirements(TESTNET, { asset: "EURR" });

      const result = await scheme.settle(payload, requirements);

      expect(result.success).toBe(true);
    });

    it("rejects PLT payment with wrong token", async () => {
      const txHash = "plt-wrong-token";
      const mockClient = createMockClient(
        new Map([[txHash, createTxInfo(txHash, { asset: "USDC" })]]),
      );
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload = createPayload(txHash, TESTNET, { asset: "EURR" });
      const requirements = createRequirements(TESTNET, { asset: "EURR" });

      const result = await scheme.settle(payload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("asset_mismatch");
    });
  });

  describe("Multi-Network Support", () => {
    it("supports mainnet", async () => {
      const txHash = "mainnet-tx";
      const mockClient = createMockClient(new Map([[txHash, createTxInfo(txHash)]]));
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload = createPayload(txHash, MAINNET);
      const requirements = createRequirements(MAINNET);

      const result = await scheme.settle(payload, requirements);

      expect(result.success).toBe(true);
      expect(result.network).toBe(MAINNET);
    });

    it("supports testnet", async () => {
      const txHash = "testnet-tx";
      const mockClient = createMockClient(new Map([[txHash, createTxInfo(txHash)]]));
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload = createPayload(txHash, TESTNET);
      const requirements = createRequirements(TESTNET);

      const result = await scheme.settle(payload, requirements);

      expect(result.success).toBe(true);
      expect(result.network).toBe(TESTNET);
    });
  });

  describe("Verify (payload validation only)", () => {
    it("rejects missing txHash", async () => {
      const mockClient = createMockClient(new Map());
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload: PaymentPayload = {
        ...createPayload(""),
        payload: { sender: CLIENT_ADDRESS } as any,
      };

      const result = await scheme.verify(payload, createRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_tx_hash");
    });

    it("rejects missing sender", async () => {
      const mockClient = createMockClient(new Map());
      const scheme = new ExactConcordiumScheme({ client: mockClient as any });

      const payload: PaymentPayload = {
        ...createPayload("some-tx"),
        payload: { txHash: "some-tx" } as any,
      };

      const result = await scheme.verify(payload, createRequirements());

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_sender");
    });
  });
});
