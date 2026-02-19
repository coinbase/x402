import { describe, it, expect } from "vitest";
import { ExactHypercoreScheme } from "../../../src/exact/facilitator/scheme.js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type { HypercoreSendAssetAction, HypercorePaymentPayload } from "../../../src/types.js";

function createTestAction(overrides?: Partial<HypercoreSendAssetAction>): HypercoreSendAssetAction {
  return {
    type: "sendAsset",
    hyperliquidChain: "Mainnet",
    signatureChainId: "0x3e7",
    destination: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    sourceDex: "spot",
    destinationDex: "spot",
    token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    amount: "0.01000000",
    fromSubAccount: "",
    nonce: Date.now(),
    ...overrides,
  };
}

function createTestPayload(
  actionOverrides?: Partial<HypercoreSendAssetAction>,
  nonceOverride?: number,
): PaymentPayload {
  const action = createTestAction(actionOverrides);
  const hypercorePayload: HypercorePaymentPayload = {
    action,
    signature: {
      r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      v: 27,
    },
    nonce: nonceOverride ?? Date.now(),
  };

  return {
    x402Version: 2,
    payload: hypercorePayload as unknown as Record<string, unknown>,
  } as PaymentPayload;
}

function createTestRequirements(overrides?: Partial<PaymentRequirements>): PaymentRequirements {
  return {
    scheme: "exact",
    network: "hypercore:mainnet",
    payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    amount: "1000000",
    asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
    maxTimeoutSeconds: 3600,
    extra: {},
    ...overrides,
  };
}

describe("ExactHypercoreScheme (Facilitator)", () => {
  const facilitator = new ExactHypercoreScheme({
    apiUrl: "https://api.hyperliquid.xyz",
  });

  it("should have correct scheme and caipFamily", () => {
    expect(facilitator.scheme).toBe("exact");
    expect(facilitator.caipFamily).toBe("hypercore:*");
  });

  it("should return undefined for getExtra", () => {
    const result = facilitator.getExtra("hypercore:mainnet");
    expect(result).toBeUndefined();
  });

  it("should return empty array for getSigners", () => {
    const result = facilitator.getSigners("hypercore:mainnet");
    expect(result).toEqual([]);
  });

  describe("verify", () => {
    it("should reject invalid network", async () => {
      const payload = createTestPayload();
      const requirements = createTestRequirements({ network: "eip155:1" });

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("Invalid network");
    });

    it("should reject invalid action type", async () => {
      const payload = createTestPayload({
        type: "invalidType",
      } as unknown as Partial<HypercoreSendAssetAction>);
      const requirements = createTestRequirements();

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("Invalid action type");
    });

    it("should reject destination mismatch", async () => {
      const payload = createTestPayload({
        destination: "0x0000000000000000000000000000000000000000",
      });
      const requirements = createTestRequirements();

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("Destination mismatch");
    });

    it("should reject insufficient amount", async () => {
      const payload = createTestPayload({ amount: "0.00500000" });
      const requirements = createTestRequirements({ amount: "1000000" });

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("Insufficient amount");
    });

    it("should reject old nonce", async () => {
      const oneHourAgo = Date.now() - 3600000 - 1000;
      const payload = createTestPayload({ nonce: oneHourAgo }, oneHourAgo);
      const requirements = createTestRequirements();

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("Nonce too old");
    });

    it("should accept valid payload", async () => {
      const payload = createTestPayload();
      const requirements = createTestRequirements();

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(true);
    });
  });
});
