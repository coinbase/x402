import { describe, it, expect } from "vitest";
import type { ExactEvmPayloadV1, ExactEvmPayloadV2 } from "../../src/types";

describe("EVM Types", () => {
  describe("ExactEvmPayloadV1", () => {
    it("should accept valid payload structure", () => {
      const payload: ExactEvmPayloadV1 = {
        signature: "0x1234567890abcdef",
        authorization: {
          from: "0x1234567890123456789012345678901234567890",
          to: "0x9876543210987654321098765432109876543210",
          value: "100000",
          validAfter: "1234567890",
          validBefore: "1234567890",
          nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
      };

      expect(payload.signature).toBeDefined();
      expect(payload.authorization.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(payload.authorization.nonce).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it("should allow optional signature", () => {
      const payload: ExactEvmPayloadV1 = {
        authorization: {
          from: "0x1234567890123456789012345678901234567890",
          to: "0x9876543210987654321098765432109876543210",
          value: "100000",
          validAfter: "1234567890",
          validBefore: "1234567890",
          nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
      };

      expect(payload.signature).toBeUndefined();
      expect(payload.authorization).toBeDefined();
    });
  });

  describe("ExactEvmPayloadV2", () => {
    it("should have the same structure as V1", () => {
      const payload: ExactEvmPayloadV2 = {
        signature: "0x1234567890abcdef",
        authorization: {
          from: "0x1234567890123456789012345678901234567890",
          to: "0x9876543210987654321098765432109876543210",
          value: "100000",
          validAfter: "1234567890",
          validBefore: "1234567890",
          nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        },
      };

      // V2 should be compatible with V1
      const payloadV1: ExactEvmPayloadV1 = payload;
      expect(payloadV1).toEqual(payload);
    });
  });
});
