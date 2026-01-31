import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactConcordiumScheme } from "../../../src/exact/facilitator";
import { PaymentPayload, PaymentRequirements } from "@x402/core/types";

describe("ExactConcordiumScheme (Facilitator)", () => {
  let scheme: ExactConcordiumScheme;
  let mockClient: { waitForFinalization: ReturnType<typeof vi.fn> };

  const validTxInfo = {
    txHash: "abc123",
    status: "finalized" as const,
    sender: "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
    recipient: "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
    amount: "1000000",
    asset: "",
  };

  const validPayload: PaymentPayload = {
    x402Version: 2,
    payload: {
      txHash: "abc123",
      sender: "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN",
    },
    accepted: {
      scheme: "exact",
      network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
      amount: "1000000",
      asset: "",
      payTo: "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
      maxTimeoutSeconds: 300,
      extra: {},
    },
    resource: { url: "", description: "", mimeType: "" },
  };

  const validRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
    amount: "1000000",
    asset: "",
    payTo: "4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW",
    maxTimeoutSeconds: 300,
    extra: {},
  };

  beforeEach(() => {
    mockClient = {
      waitForFinalization: vi.fn().mockResolvedValue(validTxInfo),
    };

    scheme = new ExactConcordiumScheme({
      client: mockClient as any,
      finalizationTimeoutMs: 60000,
    });
  });

  describe("properties", () => {
    it("has correct scheme and caipFamily", () => {
      expect(scheme.scheme).toBe("exact");
      expect(scheme.caipFamily).toBe("ccd:*");
    });

    it("getSigners returns empty array", () => {
      expect(scheme.getSigners("ccd:*")).toEqual([]);
    });

    it("getExtra returns supported assets", () => {
      expect(scheme.getExtra("ccd:*")).toEqual({
        assets: [{ symbol: "CCD", decimals: 6 }],
      });
    });
  });

  describe("verify", () => {
    it("returns valid for correct payload", async () => {
      const result = await scheme.verify(validPayload, validRequirements);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN");
    });

    it("rejects missing txHash", async () => {
      const payload = {
        ...validPayload,
        payload: { sender: "3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN" },
      };

      const result = await scheme.verify(payload, validRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_tx_hash");
    });

    it("rejects missing sender", async () => {
      const payload = {
        ...validPayload,
        payload: { txHash: "abc123" },
      };

      const result = await scheme.verify(payload, validRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_sender");
    });
  });

  describe("settle", () => {
    it("returns success for valid payment", async () => {
      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("abc123");
      expect(result.network).toBe("ccd:4221332d34e1694168c2a0c0b3fd0f27");
      expect(result.payer).toBe("3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN");
    });

    it("waits for finalization with correct timeout", async () => {
      await scheme.settle(validPayload, validRequirements);

      expect(mockClient.waitForFinalization).toHaveBeenCalledWith("abc123", 60000);
    });

    it("fails when transaction not found", async () => {
      mockClient.waitForFinalization.mockResolvedValue(null);

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("transaction_not_found");
    });

    it("fails when transaction failed", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, status: "failed" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("transaction_failed");
    });

    it("fails when not finalized", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, status: "committed" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("finalization_timeout");
    });

    it("fails on sender mismatch", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, sender: "different" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("sender_mismatch");
    });

    it("fails on recipient mismatch", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, recipient: "different" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("recipient_mismatch");
    });

    it("fails on insufficient amount", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, amount: "500000" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("insufficient_amount");
    });

    it("fails on asset mismatch", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, asset: "EURR" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("asset_mismatch");
    });

    it("succeeds with amount greater than required", async () => {
      mockClient.waitForFinalization.mockResolvedValue({ ...validTxInfo, amount: "2000000" });

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(true);
    });

    it("fails on client exception", async () => {
      mockClient.waitForFinalization.mockRejectedValue(new Error("Network error"));

      const result = await scheme.settle(validPayload, validRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("transaction_lookup_failed");
    });
  });
});
