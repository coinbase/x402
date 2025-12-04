import { describe, it, expect } from "vitest";
import {
  PaymentRequirementsSchema,
  PaymentPayloadSchema,
  ExactBtcLightningPayload,
} from "../../../types/verify";
import { createPaymentHeader, preparePaymentHeader } from "./client";

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

describe("exact/btc_lightning client", () => {
  it("preparePaymentHeader should build a Lightning payload from bolt11", () => {
    const unsigned = preparePaymentHeader("lnbc1testinvoice...", 1, baseRequirements, "inv_123");

    expect(unsigned.scheme).toBe("exact");
    expect(unsigned.network).toBe("btc-lightning-signet");

    const payload = unsigned.payload as ExactBtcLightningPayload;
    expect(payload.bolt11).toBe("lnbc1testinvoice...");
    expect(payload.invoiceId).toBe("inv_123");
  });

  it("createPaymentHeader should return base64-encoded PaymentPayload JSON", async () => {
    const header = await createPaymentHeader(
      undefined,
      1,
      baseRequirements,
      "lnbc1testinvoice...",
      "inv_123",
    );

    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    const parsed = PaymentPayloadSchema.parse(decoded);

    expect(parsed.scheme).toBe("exact");
    expect(parsed.network).toBe("btc-lightning-signet");

    const lnPayload = parsed.payload as ExactBtcLightningPayload;
    expect(lnPayload.bolt11).toBe("lnbc1testinvoice...");
    expect(lnPayload.invoiceId).toBe("inv_123");
  });

  it("preparePaymentHeader should throw on unsupported Lightning network", () => {
    const badReq = PaymentRequirementsSchema.parse({
      ...baseRequirements,
      // still a valid Network, but *not* a Lightning network
      network: "base",
    });

    expect(() => preparePaymentHeader("lnbc1testinvoice...", 1, badReq)).toThrow(
      /btc_lightning client only supports Lightning networks/,
    );
  });

  it("preparePaymentHeader should throw if bolt11 is missing", () => {
    expect(() => preparePaymentHeader("", 1, baseRequirements)).toThrow(
      /bolt11 invoice string is required/,
    );
  });
});
