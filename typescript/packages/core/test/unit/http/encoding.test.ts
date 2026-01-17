import { describe, it, expect } from "vitest";
import {
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
} from "../../../src/http";
import { PaymentRequired, ResourceInfo } from "../../../src/types/payments";
import { Network } from "../../../src/types";
import { buildPaymentRequired } from "../../mocks";

describe("HTTP Encoding", () => {
  describe("encodePaymentRequiredHeader", () => {
    it("should encode valid PaymentRequired object", () => {
      const paymentRequired = buildPaymentRequired();
      const encoded = encodePaymentRequiredHeader(paymentRequired);

      expect(encoded).toBeDefined();
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);
    });

    it("should throw error if PaymentRequired is invalid - missing resource", () => {
      const invalid: PaymentRequired = {
        x402Version: 2,
        resource: undefined as unknown as ResourceInfo,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453" as Network,
            asset: "0x123",
            amount: "100",
            payTo: "0x456",
            maxTimeoutSeconds: 60,
            extra: {},
          },
        ],
      };

      expect(() => encodePaymentRequiredHeader(invalid)).toThrow(
        "PaymentRequired validation failed: resource is required",
      );
    });

    it("should throw error if PaymentRequired is invalid - empty accepts", () => {
      const invalid: PaymentRequired = {
        x402Version: 2,
        resource: {
          url: "https://example.com",
          description: "Test",
          mimeType: "application/json",
        },
        accepts: [],
      };

      expect(() => encodePaymentRequiredHeader(invalid)).toThrow(
        "PaymentRequired validation failed: accepts is required and must be a non-empty array",
      );
    });

    it("should throw error if PaymentRequired is invalid - invalid x402Version", () => {
      const invalid: PaymentRequired = {
        x402Version: 3,
        resource: {
          url: "https://example.com",
          description: "Test",
          mimeType: "application/json",
        },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453" as Network,
            asset: "0x123",
            amount: "100",
            payTo: "0x456",
            maxTimeoutSeconds: 60,
            extra: {},
          },
        ],
      };

      expect(() => encodePaymentRequiredHeader(invalid)).toThrow(
        "PaymentRequired validation failed: x402Version is required and must be 1 or 2",
      );
    });

    it("should throw error if PaymentRequired has invalid payment requirement", () => {
      const invalid: PaymentRequired = {
        x402Version: 2,
        resource: {
          url: "https://example.com",
          description: "Test",
          mimeType: "application/json",
        },
        accepts: [
          {
            scheme: "", // Invalid: empty scheme
            network: "eip155:8453" as Network,
            asset: "0x123",
            amount: "100",
            payTo: "0x456",
            maxTimeoutSeconds: 60,
            extra: {},
          },
        ],
      };

      expect(() => encodePaymentRequiredHeader(invalid)).toThrow(
        "PaymentRequired validation failed: accepts[0] is invalid",
      );
    });

    it("should roundtrip encode and decode", () => {
      const paymentRequired = buildPaymentRequired();
      const encoded = encodePaymentRequiredHeader(paymentRequired);
      const decoded = decodePaymentRequiredHeader(encoded);

      expect(decoded.x402Version).toBe(paymentRequired.x402Version);
      expect(decoded.resource).toEqual(paymentRequired.resource);
      expect(decoded.accepts).toEqual(paymentRequired.accepts);
      if (paymentRequired.error) {
        expect(decoded.error).toBe(paymentRequired.error);
      }
    });
  });
});
