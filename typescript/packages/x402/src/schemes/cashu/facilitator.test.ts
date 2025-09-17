import { describe, expect, it } from "vitest";
import { createPaymentPayload } from "./client";
import { verify, settle } from "./facilitator";
import { CashuPaymentRequirements } from "../../types/verify";

const requirements: CashuPaymentRequirements = {
  scheme: "cashu-token",
  network: "bitcoin-testnet",
  resource: "https://api.example.com/resource",
  description: "Test resource",
  mimeType: "application/json",
  maxAmountRequired: "5000",
  maxTimeoutSeconds: 300,
  extra: {
    mintUrl: "https://nofees.testnut.cashu.space/",
  },
  payTo: "cashu:merchant-pubkey",
};

const paymentPayload = createPaymentPayload({
  x402Version: 1,
  paymentRequirements: requirements,
  proofs: [
    { amount: 3000, secret: "secret-1", C: "C-1", id: "keyset-1" },
    { amount: 3000, secret: "secret-2", C: "C-2", id: "keyset-1" },
  ],
  payer: "payer-id",
});

describe("cashu facilitator", () => {
  it("verifies a valid payment payload", async () => {
    const result = await verify(undefined, paymentPayload, requirements);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe("payer-id");
  });

  it("rejects payments below the required amount", async () => {
    const smallPayment = {
      ...paymentPayload,
      payload: {
        ...paymentPayload.payload,
        proofs: [{ amount: 1000, secret: "secret", C: "C", id: "keyset-1" }],
      },
    };

    const result = await verify(undefined, smallPayment, requirements);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("invalid_cashu_payload_amount_mismatch");
  });

  it("settles a verified payment", async () => {
    const result = await settle(undefined, paymentPayload, requirements);
    expect(result.success).toBe(true);
    expect(result.transaction.startsWith("cashu:")).toBe(true);
  });
});
