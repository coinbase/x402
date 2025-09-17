import { describe, expect, it } from "vitest";
import { createPaymentPayload, createPaymentHeader } from "./client";
import { decodePayment } from "../utils";
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

const proofs = [
  {
    amount: 2000,
    secret: "secret-1",
    C: "C-1",
    id: "keyset-1",
  },
  {
    amount: 4000,
    secret: "secret-2",
    C: "C-2",
    id: "keyset-1",
  },
];

describe("cashu client", () => {
  it("creates a valid payment payload", () => {
    const payload = createPaymentPayload({
      x402Version: 1,
      paymentRequirements: requirements,
      proofs,
      memo: "test",
      payer: "payer-id",
    });

    expect(payload.scheme).toBe("cashu-token");
    expect(payload.payload.mint).toBe("https://nofees.testnut.cashu.space/");
    expect(payload.payload.proofs.length).toBe(2);
  });

  it("encodes and decodes a payment header", () => {
    const header = createPaymentHeader({
      x402Version: 1,
      paymentRequirements: requirements,
      proofs,
    });

    const decoded = decodePayment(header);

    expect(decoded.scheme).toBe("cashu-token");
    expect(decoded.payload).toMatchObject({ proofs });
  });
});
