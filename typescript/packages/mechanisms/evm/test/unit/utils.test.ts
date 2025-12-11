import { describe, it, expect } from "vitest";
import { getEvmChainId, createNonce } from "../../src/utils";

describe("EVM Utils", () => {
  describe("getEvmChainId", () => {
    it("should return correct chain ID for Base", () => {
      expect(getEvmChainId("base")).toBe(8453);
    });

    it("should return correct chain ID for Base Sepolia", () => {
      expect(getEvmChainId("base-sepolia")).toBe(84532);
    });

    it("should return correct chain ID for Ethereum mainnet", () => {
      expect(getEvmChainId("ethereum")).toBe(1);
    });

    it("should return correct chain ID for Sepolia", () => {
      expect(getEvmChainId("sepolia")).toBe(11155111);
    });

    it("should return correct chain ID for Polygon", () => {
      expect(getEvmChainId("polygon")).toBe(137);
    });

    it("should return correct chain ID for Polygon Amoy", () => {
      expect(getEvmChainId("polygon-amoy")).toBe(80002);
    });

    it("should return default chain ID (1) for unknown networks", () => {
      expect(getEvmChainId("unknown-network")).toBe(1);
    });
  });

  describe("createNonce", () => {
    it("should create a 32-byte hex nonce", () => {
      const nonce = createNonce();
      expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("should create different nonces on each call", () => {
      const nonce1 = createNonce();
      const nonce2 = createNonce();
      expect(nonce1).not.toBe(nonce2);
    });

    it("should create valid hex strings", () => {
      for (let i = 0; i < 10; i++) {
        const nonce = createNonce();
        expect(nonce.startsWith("0x")).toBe(true);
        expect(nonce.length).toBe(66); // "0x" + 64 hex characters
      }
    });
  });
});
