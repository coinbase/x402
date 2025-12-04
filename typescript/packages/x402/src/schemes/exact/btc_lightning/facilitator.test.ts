import { describe, it, expect } from "vitest";
import {
  PaymentRequirementsSchema,
  PaymentPayloadSchema,
  ExactBtcLightningPayloadSchema,
  PaymentPayload,
} from "../../../types/verify";
import { verify, settle } from "./facilitator";

// A fake but structurally BOLT11-like invoice string:
//  - starts with "lnbc"
//  - all lowercase [0-9a-z]
//  - reasonably long
const VALID_BOLT11 = "lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqf";

const baseRequirements = PaymentRequirementsSchema.parse({
  scheme: "exact",
  network: "btc-lightning-signet",
  maxAmountRequired: "10000",
  resource: "https://api.example.com/premium-data",
  description: "Test Lightning resource",
  mimeType: "application/json",
  payTo: "lnbits-test-destination",
  maxTimeoutSeconds: 600,
  asset: "lnbits-test-asset",
});

const basePayload: PaymentPayload = PaymentPayloadSchema.parse({
  x402Version: 1,
  scheme: "exact",
  network: "btc-lightning-signet",
  payload: ExactBtcLightningPayloadSchema.parse({
    bolt11: VALID_BOLT11,
    invoiceId: "inv_123",
  }),
});

describe("exact/btc_lightning facilitator.verify", () => {
  it("returns isValid=true for structurally sane payload", async () => {
    const res = await verify(undefined, basePayload, baseRequirements);
    expect(res.isValid).toBe(true);
    expect(res.invalidReason).toBeUndefined();
  });

  it("rejects mismatched network", async () => {
    const badPayload: PaymentPayload = {
      ...basePayload,
      network: "base",
    };

    const res = await verify(undefined, badPayload, baseRequirements);
    expect(res.isValid).toBe(false);
    expect(res.invalidReason).toBe("invalid_network");
  });

  it("rejects payload without a valid bolt11 field", async () => {
    const badPayload: PaymentPayload = PaymentPayloadSchema.parse({
      x402Version: 1,
      scheme: "exact",
      network: "btc-lightning-signet",
      payload: {
        // This should fail looksLikeBolt11()
        bolt11: "not-a-ln-invoice",
      },
    });

    const res = await verify(undefined, badPayload, baseRequirements);
    expect(res.isValid).toBe(false);
    expect(res.invalidReason).toBe("invalid_payload");
  });
});

describe("exact/btc_lightning facilitator.settle", () => {
  it("returns success=true when verify passes (PoC behaviour)", async () => {
    const res = await settle(undefined, basePayload, baseRequirements);

    expect(res.success).toBe(true);
    expect(res.network).toBe("btc-lightning-signet");
    expect(res.transaction.length).toBeGreaterThan(0);
  });
});
