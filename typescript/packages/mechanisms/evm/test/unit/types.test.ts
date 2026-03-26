import { describe, it, expect } from "vitest";
import type {
  ExactEvmPayloadV1,
  ExactEvmPayloadV2,
  ExactEIP3009Payload,
  ExactERC7710Payload,
} from "../../src/types";
import { isEIP3009Payload, isERC7710Payload } from "../../src/types";

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
    it("should accept EIP-3009 payload structure", () => {
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
      const payloadV1: ExactEvmPayloadV1 = payload as ExactEIP3009Payload;
      expect(payloadV1).toEqual(payload);
    });

    it("should accept ERC-7710 payload structure", () => {
      const payload: ExactEvmPayloadV2 = {
        delegationManager: "0x1234567890123456789012345678901234567890",
        permissionContext: "0xabcdef1234567890",
        delegator: "0x9876543210987654321098765432109876543210",
      };

      expect((payload as ExactERC7710Payload).delegationManager).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect((payload as ExactERC7710Payload).delegator).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect((payload as ExactERC7710Payload).permissionContext).toBeDefined();
    });
  });

  describe("ExactERC7710Payload", () => {
    it("should accept valid ERC-7710 payload structure", () => {
      const payload: ExactERC7710Payload = {
        delegationManager: "0x1234567890123456789012345678901234567890",
        permissionContext: "0xabcdef1234567890abcdef1234567890",
        delegator: "0x9876543210987654321098765432109876543210",
      };

      expect(payload.delegationManager).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(payload.delegator).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(payload.permissionContext).toMatch(/^0x[0-9a-fA-F]+$/);
    });
  });

  describe("Type Guards", () => {
    const eip3009Payload: ExactEIP3009Payload = {
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

    const erc7710Payload: ExactERC7710Payload = {
      delegationManager: "0x1234567890123456789012345678901234567890",
      permissionContext: "0xabcdef1234567890",
      delegator: "0x9876543210987654321098765432109876543210",
    };

    describe("isEIP3009Payload", () => {
      it("should return true for EIP-3009 payload", () => {
        expect(isEIP3009Payload(eip3009Payload)).toBe(true);
      });

      it("should return false for ERC-7710 payload", () => {
        expect(isEIP3009Payload(erc7710Payload)).toBe(false);
      });
    });

    describe("isERC7710Payload", () => {
      it("should return true for ERC-7710 payload", () => {
        expect(isERC7710Payload(erc7710Payload)).toBe(true);
      });

      it("should return false for EIP-3009 payload", () => {
        expect(isERC7710Payload(eip3009Payload)).toBe(false);
      });
    });
  });
});
