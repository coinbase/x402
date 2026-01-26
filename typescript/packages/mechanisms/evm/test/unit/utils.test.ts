import { describe, it, expect } from "vitest";
import { getEvmChainId, createNonce } from "../../src/utils";
import { EvmNetworkV1 } from "../../src/v1";

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

    it("should return correct chain ID for Abstract", () => {
      expect(getEvmChainId("abstract")).toBe(2741);
    });

    it("should return correct chain ID for Abstract Testnet", () => {
      expect(getEvmChainId("abstract-testnet")).toBe(11124);
    });

    it("should return correct chain ID for Avalanche Fuji", () => {
      expect(getEvmChainId("avalanche-fuji")).toBe(43113);
    });

    it("should return correct chain ID for Avalanche", () => {
      expect(getEvmChainId("avalanche")).toBe(43114);
    });

    it("should return correct chain ID for IoTeX", () => {
      expect(getEvmChainId("iotex")).toBe(4689);
    });

    it("should return correct chain ID for Sei", () => {
      expect(getEvmChainId("sei")).toBe(1329);
    });

    it("should return correct chain ID for Sei Testnet", () => {
      expect(getEvmChainId("sei-testnet")).toBe(1328);
    });

    it("should return correct chain ID for Peaq", () => {
      expect(getEvmChainId("peaq")).toBe(3338);
    });

    it("should return correct chain ID for Story", () => {
      expect(getEvmChainId("story")).toBe(1514);
    });

    it("should return correct chain ID for Educhain", () => {
      expect(getEvmChainId("educhain")).toBe(41923);
    });

    it("should return correct chain ID for Skale Base Sepolia", () => {
      expect(getEvmChainId("skale-base-sepolia")).toBe(324705682);
    });

    it("should throw for unsupported network", () => {
      expect(() => getEvmChainId("unknown-network" as EvmNetworkV1)).toThrow(
        "Unsupported network: unknown-network",
      );
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
