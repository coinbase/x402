import { describe, expect, it } from "vitest";
import { encodePayment, decodePayment } from "./paymentUtils";
import { PaymentPayload } from "../../../../types/verify";
import {
  DeferredPaymentPayload,
  DEFERRRED_SCHEME,
} from "../../../../types/verify/schemes/deferred";

const buyerAddress = "0xf33332f96E5EA32c90a5301b646Bf5e93EA1D892";
const sellerAddress = "0x1234567890123456789012345678901234567890";
const escrowAddress = "0xffffff12345678901234567890123456789fffff";
const assetAddress = "0x1111111111111111111111111111111111111111";
const voucherId = "0x7a3e9b10e8a59f9b4e87219b7e5f3e69ac1b7e4625b5de38b1ff8d470ab7f4f1";
const voucherSignature =
  "0x899b52ba76bebfc79405b67d9004ed769a998b34a6be8695c265f32fee56b1a903f563f2abe1e02cc022e332e2cef2c146fb057567316966303480afdd88aff11c";

describe("paymentUtils", () => {
  const mockPaymentPayload: DeferredPaymentPayload = {
    x402Version: 1,
    scheme: DEFERRRED_SCHEME,
    network: "base-sepolia",
    payload: {
      signature: voucherSignature,
      voucher: {
        id: voucherId,
        buyer: buyerAddress,
        seller: sellerAddress,
        valueAggregate: "1000000",
        asset: assetAddress,
        timestamp: 1715769600,
        nonce: 0,
        escrow: escrowAddress,
        chainId: 84532,
        expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    },
  };

  describe("encodePayment", () => {
    it("should encode a deferred payment payload to base64 string", () => {
      const encoded = encodePayment(mockPaymentPayload);

      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);

      // Should be valid base64
      expect(() => {
        Buffer.from(encoded, "base64");
      }).not.toThrow();
    });

    it("should handle vouchers with zero values", () => {
      const zeroValuePayload = {
        ...mockPaymentPayload,
        payload: {
          ...mockPaymentPayload.payload,
          voucher: {
            ...mockPaymentPayload.payload.voucher,
            valueAggregate: "0",
            timestamp: 0,
            nonce: 0,
            chainId: 0,
            expiry: 0,
          },
        },
      };

      const encoded = encodePayment(zeroValuePayload);
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("should throw error for invalid payment payload", () => {
      const invalidPayload = {
        x402Version: 1,
        scheme: "invalid-scheme",
        network: "base-sepolia",
      } as unknown as PaymentPayload;

      expect(() => encodePayment(invalidPayload)).toThrow();
    });

    it("should produce consistent encoding for identical inputs", () => {
      const encoded1 = encodePayment(mockPaymentPayload);
      const encoded2 = encodePayment(mockPaymentPayload);

      expect(encoded1).toBe(encoded2);
    });
  });

  describe("decodePayment", () => {
    it("should decode a valid encoded payment payload", () => {
      const encoded = encodePayment(mockPaymentPayload);
      const decoded = decodePayment(encoded);

      expect(decoded).toEqual(mockPaymentPayload);
    });

    it("should correctly decode voucher fields as expected types", () => {
      const encoded = encodePayment(mockPaymentPayload);
      const decoded = decodePayment(encoded) as DeferredPaymentPayload;

      expect(typeof decoded.x402Version).toBe("number");
      expect(typeof decoded.scheme).toBe("string");
      expect(typeof decoded.network).toBe("string");
      expect(typeof decoded.payload.signature).toBe("string");
      expect(typeof decoded.payload.voucher.id).toBe("string");
      expect(typeof decoded.payload.voucher.buyer).toBe("string");
      expect(typeof decoded.payload.voucher.seller).toBe("string");
      expect(typeof decoded.payload.voucher.valueAggregate).toBe("string");
      expect(typeof decoded.payload.voucher.asset).toBe("string");
      expect(typeof decoded.payload.voucher.timestamp).toBe("number");
      expect(typeof decoded.payload.voucher.nonce).toBe("number");
      expect(typeof decoded.payload.voucher.escrow).toBe("string");
      expect(typeof decoded.payload.voucher.chainId).toBe("number");
      expect(typeof decoded.payload.voucher.expiry).toBe("number");
    });

    it("should handle zero values correctly", () => {
      const zeroValuePayload = {
        ...mockPaymentPayload,
        payload: {
          ...mockPaymentPayload.payload,
          voucher: {
            ...mockPaymentPayload.payload.voucher,
            valueAggregate: "0",
            timestamp: 0,
            nonce: 0,
            chainId: 0,
            expiry: 0,
          },
        },
      };

      const encoded = encodePayment(zeroValuePayload);
      const decoded = decodePayment(encoded) as DeferredPaymentPayload;

      expect(decoded.payload.voucher.valueAggregate).toBe("0");
      expect(decoded.payload.voucher.timestamp).toBe(0);
      expect(decoded.payload.voucher.nonce).toBe(0);
      expect(decoded.payload.voucher.chainId).toBe(0);
      expect(decoded.payload.voucher.expiry).toBe(0);
    });

    it("should throw error for invalid base64 string", () => {
      const invalidBase64 = "invalid-base64-string!@#";

      expect(() => decodePayment(invalidBase64)).toThrow();
    });

    it("should throw error for invalid JSON in base64", () => {
      const invalidJson = Buffer.from("invalid json content").toString("base64");

      expect(() => decodePayment(invalidJson)).toThrow();
    });

    it("should throw error for valid JSON but invalid payment payload structure", () => {
      const invalidPayload = {
        x402Version: 1,
        scheme: "invalid-scheme",
        network: "base-sepolia",
      };
      const encoded = Buffer.from(JSON.stringify(invalidPayload)).toString("base64");

      expect(() => decodePayment(encoded)).toThrow();
    });

    it("should throw error for malformed voucher data", () => {
      const malformedPayload = {
        x402Version: 1,
        scheme: DEFERRRED_SCHEME,
        network: "base-sepolia",
        payload: {
          signature: voucherSignature,
          voucher: {
            id: voucherId,
            // Missing required fields
          },
        },
      };
      const encoded = Buffer.from(JSON.stringify(malformedPayload)).toString("base64");

      expect(() => decodePayment(encoded)).toThrow();
    });
  });

  describe("round-trip encoding/decoding", () => {
    it("should maintain data integrity through multiple encode/decode cycles", () => {
      let current = mockPaymentPayload;

      // Perform multiple round trips
      for (let i = 0; i < 5; i++) {
        const encoded = encodePayment(current);
        current = decodePayment(encoded) as DeferredPaymentPayload;
      }

      expect(current).toEqual(mockPaymentPayload);
    });

    it("should handle different networks", () => {
      const networkTestPayload = {
        ...mockPaymentPayload,
        network: "iotex" as const,
      };

      const encoded = encodePayment(networkTestPayload);
      const decoded = decodePayment(encoded);

      expect(decoded.network).toBe("iotex");
      expect(decoded).toEqual(networkTestPayload);
    });

    it("should handle different signature formats", () => {
      const differentSigPayload = {
        ...mockPaymentPayload,
        payload: {
          ...mockPaymentPayload.payload,
          signature: "0x" + "0".repeat(130), // Different valid signature format
        },
      };

      const encoded = encodePayment(differentSigPayload);
      const decoded = decodePayment(encoded) as DeferredPaymentPayload;

      expect(decoded.payload.signature).toBe("0x" + "0".repeat(130));
      expect(decoded).toEqual(differentSigPayload);
    });

    it("should handle voucher with mixed case addresses", () => {
      const mixedCasePayload = {
        ...mockPaymentPayload,
        payload: {
          ...mockPaymentPayload.payload,
          voucher: {
            ...mockPaymentPayload.payload.voucher,
            buyer: "0xF33332f96E5EA32c90a5301b646Bf5e93EA1D892",
            seller: "0x1234567890123456789012345678901234567890",
            asset: "0x1111111111111111111111111111111111111111",
            escrow: "0xFFFFFF12345678901234567890123456789FFFFF",
          },
        },
      };

      const encoded = encodePayment(mixedCasePayload);
      const decoded = decodePayment(encoded);

      expect(decoded).toEqual(mixedCasePayload);
    });
  });

  describe("depositAuthorization handling", () => {
    const mockPaymentWithDepositAuth: DeferredPaymentPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        depositAuthorization: {
          permit: {
            owner: buyerAddress,
            spender: escrowAddress,
            value: "1000000",
            nonce: "0",
            deadline: 1715769600 + 1000 * 60 * 60 * 24 * 30,
            domain: {
              name: "USD Coin",
              version: "2",
            },
            signature:
              "0x1ed1158f8c70dc6393f8c9a379bf4569eb13a0ae6f060465418cbb9acbf5fb536eda5bdb7a6a28317329df0b9aec501fdf15f02f04b60ac536b90da3ce6f3efb1c",
          },
          depositAuthorization: {
            buyer: buyerAddress,
            seller: sellerAddress,
            asset: assetAddress,
            amount: "1000000",
            nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
            expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
            signature:
              "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b",
          },
        },
      },
    };

    const mockPaymentWithDepositAuthNoPermit: DeferredPaymentPayload = {
      ...mockPaymentPayload,
      payload: {
        ...mockPaymentPayload.payload,
        depositAuthorization: {
          depositAuthorization: {
            buyer: buyerAddress,
            seller: sellerAddress,
            asset: assetAddress,
            amount: "1000000",
            nonce: "0x0000000000000000000000000000000000000000000000000000000000000000",
            expiry: 1715769600 + 1000 * 60 * 60 * 24 * 30,
            signature:
              "0xbfdc3d0ae7663255972fdf5ce6dfc7556a5ac1da6768e4f4a942a2fa885737db5ddcb7385de4f4b6d483b97beb6a6103b46971f63905a063deb7b0cfc33473411b",
          },
        },
      },
    };

    it("should encode payment with depositAuthorization (with permit)", () => {
      const encoded = encodePayment(mockPaymentWithDepositAuth);

      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("should decode payment with depositAuthorization (with permit)", () => {
      const encoded = encodePayment(mockPaymentWithDepositAuth);
      const decoded = decodePayment(encoded) as DeferredPaymentPayload;

      expect(decoded).toEqual(mockPaymentWithDepositAuth);
      expect(decoded.payload.depositAuthorization).toBeDefined();
      expect(decoded.payload.depositAuthorization?.permit).toBeDefined();
      expect(decoded.payload.depositAuthorization?.depositAuthorization).toBeDefined();
    });

    it("should encode payment with depositAuthorization (without permit)", () => {
      const encoded = encodePayment(mockPaymentWithDepositAuthNoPermit);

      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("should decode payment with depositAuthorization (without permit)", () => {
      const encoded = encodePayment(mockPaymentWithDepositAuthNoPermit);
      const decoded = decodePayment(encoded) as DeferredPaymentPayload;

      expect(decoded).toEqual(mockPaymentWithDepositAuthNoPermit);
      expect(decoded.payload.depositAuthorization).toBeDefined();
      expect(decoded.payload.depositAuthorization?.permit).toBeUndefined();
      expect(decoded.payload.depositAuthorization?.depositAuthorization).toBeDefined();
    });

    it("should round-trip payment with depositAuthorization", () => {
      let current = mockPaymentWithDepositAuth;

      for (let i = 0; i < 3; i++) {
        const encoded = encodePayment(current);
        current = decodePayment(encoded) as DeferredPaymentPayload;
      }

      expect(current).toEqual(mockPaymentWithDepositAuth);
    });

    it("should handle payment without depositAuthorization", () => {
      const encoded = encodePayment(mockPaymentPayload);
      const decoded = decodePayment(encoded) as DeferredPaymentPayload;

      expect(decoded.payload.depositAuthorization).toBeUndefined();
      expect(decoded).toEqual(mockPaymentPayload);
    });
  });
});
