import { describe, it, expect } from "vitest";
import type {
  HypercoreSendAssetAction,
  HypercorePaymentPayload,
  HyperliquidApiResponse,
} from "../../src/types.js";

describe("Hypercore Types", () => {
  describe("HypercoreSendAssetAction", () => {
    it("should accept valid mainnet SendAsset action", () => {
      const action: HypercoreSendAssetAction = {
        type: "sendAsset",
        hyperliquidChain: "Mainnet",
        signatureChainId: "0x3e7",
        destination: "0x9876543210987654321098765432109876543210",
        sourceDex: "spot",
        destinationDex: "spot",
        token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        amount: "0.010000",
        fromSubAccount: "",
        nonce: 1738697234567,
      };

      expect(action.type).toBe("sendAsset");
      expect(action.hyperliquidChain).toBe("Mainnet");
      expect(action.signatureChainId).toBe("0x3e7");
      expect(action.destination).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(action.nonce).toBeGreaterThan(0);
    });

    it("should accept valid testnet SendAsset action", () => {
      const action: HypercoreSendAssetAction = {
        type: "sendAsset",
        hyperliquidChain: "Testnet",
        signatureChainId: "0x3e7",
        destination: "0x1234567890123456789012345678901234567890",
        sourceDex: "spot",
        destinationDex: "spot",
        token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        amount: "1.000000",
        fromSubAccount: "",
        nonce: Date.now(),
      };

      expect(action.hyperliquidChain).toBe("Testnet");
      expect(action.destination).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should accept perp dex", () => {
      const action: HypercoreSendAssetAction = {
        type: "sendAsset",
        hyperliquidChain: "Mainnet",
        signatureChainId: "0x3e7",
        destination: "0x1234567890123456789012345678901234567890",
        sourceDex: "perp",
        destinationDex: "perp",
        token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        amount: "0.100000",
        fromSubAccount: "",
        nonce: Date.now(),
      };

      expect(action.sourceDex).toBe("perp");
      expect(action.destinationDex).toBe("perp");
    });

    it("should accept subaccount", () => {
      const action: HypercoreSendAssetAction = {
        type: "sendAsset",
        hyperliquidChain: "Mainnet",
        signatureChainId: "0x3e7",
        destination: "0x1234567890123456789012345678901234567890",
        sourceDex: "spot",
        destinationDex: "spot",
        token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        amount: "0.500000",
        fromSubAccount: "subaccount1",
        nonce: Date.now(),
      };

      expect(action.fromSubAccount).toBe("subaccount1");
    });
  });

  describe("HypercorePaymentPayload", () => {
    it("should accept valid payment payload", () => {
      const payload: HypercorePaymentPayload = {
        action: {
          type: "sendAsset",
          hyperliquidChain: "Mainnet",
          signatureChainId: "0x3e7",
          destination: "0x9876543210987654321098765432109876543210",
          sourceDex: "spot",
          destinationDex: "spot",
          token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
          amount: "0.010000",
          fromSubAccount: "",
          nonce: 1738697234567,
        },
        signature: {
          r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          v: 27,
        },
        nonce: 1738697234567,
      };

      expect(payload.action).toBeDefined();
      expect(payload.signature).toBeDefined();
      expect(payload.signature.r).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(payload.signature.s).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(payload.signature.v).toBeGreaterThanOrEqual(27);
      expect(payload.signature.v).toBeLessThanOrEqual(28);
      expect(payload.nonce).toBe(payload.action.nonce);
    });

    it("should match action and payload nonce", () => {
      const nonce = Date.now();
      const payload: HypercorePaymentPayload = {
        action: {
          type: "sendAsset",
          hyperliquidChain: "Testnet",
          signatureChainId: "0x3e7",
          destination: "0x1234567890123456789012345678901234567890",
          sourceDex: "spot",
          destinationDex: "spot",
          token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
          amount: "1.000000",
          fromSubAccount: "",
          nonce,
        },
        signature: {
          r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          v: 28,
        },
        nonce,
      };

      expect(payload.nonce).toBe(payload.action.nonce);
    });
  });

  describe("HyperliquidApiResponse", () => {
    it("should accept successful response", () => {
      const response: HyperliquidApiResponse = {
        status: "ok",
        response: {
          type: "default",
          data: { txHash: "0xabc123" },
        },
      };

      expect(response.status).toBe("ok");
      expect(response.response).toBeDefined();
    });

    it("should accept error response", () => {
      const response: HyperliquidApiResponse = {
        status: "err",
        response: {
          type: "error",
          data: { message: "Insufficient balance" },
        },
      };

      expect(response.status).toBe("err");
      expect(response.response).toBeDefined();
    });

    it("should accept response without data", () => {
      const response: HyperliquidApiResponse = {
        status: "ok",
      };

      expect(response.status).toBe("ok");
      expect(response.response).toBeUndefined();
    });

    it("should accept minimal error response", () => {
      const response: HyperliquidApiResponse = {
        status: "err",
      };

      expect(response.status).toBe("err");
      expect(response.response).toBeUndefined();
    });
  });
});
