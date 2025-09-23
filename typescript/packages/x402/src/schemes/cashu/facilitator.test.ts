import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaymentPayload } from "./client";
import { verify, settle } from "./facilitator";
import { CashuPaymentRequirements } from "../../types/verify";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";

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

const paymentPayload = createPaymentPayload({
  x402Version: 1,
  paymentRequirements: requirements,
  tokens: [
    {
      mint: "https://nofees.testnut.cashu.space/",
      proofs: [
        {
          amount: 3000,
          secret: "secret-1",
          C: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
          id: "001122aabbccdd",
        },
        {
          amount: 3000,
          secret: "secret-2",
          C: "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          id: "001122aabbccdd",
        },
      ],
    },
  ],
  payer: "payer-id",
});

const smallPayment = createPaymentPayload({
  x402Version: 1,
  paymentRequirements: {
    ...requirements,
    maxAmountRequired: "1000",
  },
  tokens: [
    {
      mint: "https://nofees.testnut.cashu.space/",
      proofs: [
        {
          amount: 1000,
          secret: "secret",
          C: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          id: "001122aabbccdd",
        },
      ],
    },
  ],
});

beforeEach(() => {
  vi.spyOn(CashuMint, "check").mockImplementation(async (_mintUrl, payload) => ({
    states: payload.Ys.map(Y => ({ Y, state: "UNSPENT", witness: null })),
  }));

  vi.spyOn(CashuWallet.prototype, "receive").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cashu facilitator", () => {
  it("verifies a valid payment payload", async () => {
    const result = await verify(undefined, paymentPayload, requirements);
    expect(result.isValid).toBe(true);
    expect(result.payer).toBe("payer-id");
  });

  it("rejects payments below the required amount", async () => {
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
