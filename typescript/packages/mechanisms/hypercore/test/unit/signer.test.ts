import { describe, it, expect } from "vitest";
import { toClientHypercoreSigner, toFacilitatorHypercoreSigner } from "../../src/signer.js";
import type { ClientHypercoreSigner } from "../../src/signer.js";

describe("Hypercore Signer Converters", () => {
  describe("toClientHypercoreSigner", () => {
    it("should return the same signer (identity function)", () => {
      const mockSigner: ClientHypercoreSigner = {
        signSendAsset: async () => ({
          r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
          v: 27,
        }),
        getAddress: () => "0x1234567890123456789012345678901234567890",
      };

      const result = toClientHypercoreSigner(mockSigner);
      expect(result).toBe(mockSigner);
      expect(result.getAddress()).toBe(mockSigner.getAddress());
    });

    it("should preserve signer methods", async () => {
      const mockAction = {
        type: "sendAsset" as const,
        hyperliquidChain: "Mainnet" as const,
        signatureChainId: "0x3e7",
        destination: "0x9876543210987654321098765432109876543210",
        sourceDex: "spot" as const,
        destinationDex: "spot" as const,
        token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        amount: "0.010000",
        fromSubAccount: "",
        nonce: 1738697234567,
      };

      const mockSigner: ClientHypercoreSigner = {
        signSendAsset: async action => {
          expect(action).toEqual(mockAction);
          return {
            r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            s: "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
            v: 27,
          };
        },
        getAddress: () => "0x1234567890123456789012345678901234567890",
      };

      const result = toClientHypercoreSigner(mockSigner);
      const signature = await result.signSendAsset(mockAction);

      expect(signature.r).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(signature.s).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(signature.v).toBeGreaterThanOrEqual(27);
      expect(signature.v).toBeLessThanOrEqual(28);
    });
  });

  describe("toFacilitatorHypercoreSigner", () => {
    it("should create facilitator signer from API URL", () => {
      const apiUrl = "https://api.hyperliquid.xyz";
      const result = toFacilitatorHypercoreSigner(apiUrl);

      expect(result.apiUrl).toBe(apiUrl);
    });

    it("should work with mainnet API URL", () => {
      const result = toFacilitatorHypercoreSigner("https://api.hyperliquid.xyz");
      expect(result.apiUrl).toBe("https://api.hyperliquid.xyz");
    });

    it("should work with testnet API URL", () => {
      const result = toFacilitatorHypercoreSigner("https://api.hyperliquid-testnet.xyz");
      expect(result.apiUrl).toBe("https://api.hyperliquid-testnet.xyz");
    });

    it("should work with custom API URL", () => {
      const customUrl = "https://custom-hyperliquid-api.example.com";
      const result = toFacilitatorHypercoreSigner(customUrl);
      expect(result.apiUrl).toBe(customUrl);
    });
  });
});
