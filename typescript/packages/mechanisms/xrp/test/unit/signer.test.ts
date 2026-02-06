import { describe, it, expect, beforeEach } from "vitest";
import { Wallet } from "xrpl";
import {
  toClientXrpSigner,
  toFacilitatorXrpSigner,
  isXrpPayload,
  validateXrpAddress,
  dropsToXrp,
  xrpToDrops,
} from "../../src/signer";
import { ExactXrpPayloadV2 } from "../../src/types";

describe("signer utilities", () => {
  describe("isXrpPayload", () => {
    it("should return true for valid XRP payload", () => {
      const validPayload: ExactXrpPayloadV2 = {
        signedTransaction: "1200002280000000...",
        transaction: {
          TransactionType: "Payment",
          Account: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
          Destination: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
          Amount: "10000",
          Fee: "12",
          Sequence: 1,
        },
      };
      expect(isXrpPayload(validPayload)).toBe(true);
    });

    it("should return false for non-XRP payload", () => {
      const invalidPayload = {
        signature: "0x1234...",
        authorization: {},
      };
      expect(isXrpPayload(invalidPayload)).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isXrpPayload(null)).toBe(false);
      expect(isXrpPayload(undefined)).toBe(false);
    });
  });

  describe("validateXrpAddress", () => {
    it("should validate classic XRP addresses", () => {
      expect(validateXrpAddress("rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj")).toBe(true);
      expect(validateXrpAddress("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).toBe(true);
    });

    it("should validate X-addresses", () => {
      expect(validateXrpAddress("X7m1kaW4K3RWMnSWEtTH4gyAYYqR9hT8hC")).toBe(true);
    });

    it("should reject invalid addresses", () => {
      expect(validateXrpAddress("invalid")).toBe(false);
      expect(validateXrpAddress("")).toBe(false);
      expect(validateXrpAddress("rShort")).toBe(false);
    });
  });

  describe("dropsToXrp / xrpToDrops", () => {
    it("should convert drops to XRP correctly", () => {
      expect(dropsToXrp("1000000")).toBe("1");
      expect(dropsToXrp("10000")).toBe("0.01");
      expect(dropsToXrp("12")).toBe("0.000012");
    });

    it("should convert XRP to drops correctly", () => {
      expect(xrpToDrops("1")).toBe("1000000");
      expect(xrpToDrops("0.01")).toBe("10000");
      expect(xrpToDrops("0.000012")).toBe("12");
    });

    it("should handle large numbers", () => {
      expect(xrpToDrops("1000000")).toBe("1000000000000");
    });
  });
});

describe("ClientXrpSigner", () => {
  let mockWallet: Wallet;
  let signer: ReturnType<typeof toClientXrpSigner>;

  beforeEach(() => {
    mockWallet = Wallet.generate();
    signer = toClientXrpSigner(mockWallet);
  });

  it("should return correct CAIP2 family", () => {
    expect(signer.getCaip2Family()).toBe("xrp:*");
  });

  it("should return the signer's address", () => {
    expect(signer.getAddress()).toBe(mockWallet.address);
  });

  it("should sign a payment transaction", async () => {
    const tx = {
      TransactionType: "Payment" as const,
      Account: mockWallet.address,
      Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      Amount: "10000",
      Fee: "12",
      Sequence: 1,
    };

    const result = await signer.sign(tx);
    expect(result.signedTransaction).toBeDefined();
    expect(result.signedTransaction).toContain("120000"); // XRP tx prefix
    expect(result.transaction).toEqual(tx);
  });

  it("should include memos when signing", async () => {
    const tx = {
      TransactionType: "Payment" as const,
      Account: mockWallet.address,
      Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      Amount: "10000",
      Fee: "12",
      Sequence: 1,
      Memos: [
        {
          Memo: {
            MemoType: "x402_payment",
            MemoData: "74657374",
          },
        },
      ],
    };

    const result = await signer.sign(tx);
    expect(result.signedTransaction).toBeDefined();
  });

  it("should include destination tag when signing", async () => {
    const tx = {
      TransactionType: "Payment" as const,
      Account: mockWallet.address,
      Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      Amount: "10000",
      Fee: "12",
      Sequence: 1,
      DestinationTag: 12345,
    };

    const result = await signer.sign(tx);
    expect(result.signedTransaction).toBeDefined();
  });
});

describe("FacilitatorXrpSigner", () => {
  it("should create facilitator signer with client", () => {
    const mockClient = {
      submit: async () => ({ result: { engine_result: "tesSUCCESS" } }),
      getBalances: async () => [{ currency: "XRP", value: "100" }],
      disconnect: async () => {},
    };

    const signer = toFacilitatorXrpSigner(mockClient as any);
    expect(signer.getCaip2Family()).toBe("xrp:*");
  });
});
