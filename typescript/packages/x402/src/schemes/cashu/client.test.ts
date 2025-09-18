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
    mints: ["https://nofees.testnut.cashu.space/"],
    unit: "sat",
  },
  payTo: "cashu:merchant-pubkey",
};

const tokens = [
  {
    mint: "https://nofees.testnut.cashu.space/",
    proofs: [
      {
        amount: 2000,
        secret: "secret-1",
        C: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        id: "001122aabbccdd",
      },
      {
        amount: 4000,
        secret: "secret-2",
        C: "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
        id: "001122aabbccdd",
      },
    ],
  },
];

describe("cashu client", () => {
  it("creates a valid payment payload", () => {
    const payload = createPaymentPayload({
      x402Version: 1,
      paymentRequirements: requirements,
      tokens,
      memo: "test",
      payer: "payer-id",
    });

    expect(payload.scheme).toBe("cashu-token");
    expect(payload.payload.tokens[0]?.mint).toBe("https://nofees.testnut.cashu.space/");
    expect(payload.payload.encoded.length).toBe(1);
  });

  it("encodes and decodes a payment header", () => {
    const header = createPaymentHeader({
      x402Version: 1,
      paymentRequirements: requirements,
      tokens,
    });

    const decoded = decodePayment(header);

    expect(decoded.scheme).toBe("cashu-token");
    expect(decoded.payload).toMatchObject({ tokens });
    expect(decoded.payload.encoded[0]).toMatch(/^cashuB/);
  });
});
