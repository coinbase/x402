import { describe, it, expect } from "vitest";
import {
  BASE_MAINNET,
  BASE_SEPOLIA,
  BASE_NETWORKS,
  isBaseNetwork,
  assertBaseNetwork,
  findBaseDefaultAsset,
} from "../../src/networks";

describe("networks", () => {
  describe("BASE_NETWORKS", () => {
    it("contains exactly Base mainnet and Base Sepolia", () => {
      expect(BASE_MAINNET).toBe("eip155:8453");
      expect(BASE_SEPOLIA).toBe("eip155:84532");
      expect(BASE_NETWORKS).toEqual(["eip155:8453", "eip155:84532"]);
    });
  });

  describe("isBaseNetwork", () => {
    it("accepts Base mainnet and Base Sepolia", () => {
      expect(isBaseNetwork("eip155:8453")).toBe(true);
      expect(isBaseNetwork("eip155:84532")).toBe(true);
    });

    it("rejects other EVM networks", () => {
      expect(isBaseNetwork("eip155:1")).toBe(false);
      expect(isBaseNetwork("eip155:137")).toBe(false);
      expect(isBaseNetwork("eip155:42161")).toBe(false);
    });

    it("rejects non-EVM networks", () => {
      expect(isBaseNetwork("solana:mainnet")).toBe(false);
      expect(isBaseNetwork("solana:*")).toBe(false);
    });

    it("rejects wildcards and garbage input", () => {
      expect(isBaseNetwork("eip155:*")).toBe(false);
      expect(isBaseNetwork("")).toBe(false);
      expect(isBaseNetwork("not-a-network")).toBe(false);
    });
  });

  describe("assertBaseNetwork", () => {
    it("does not throw for Base mainnet or Base Sepolia", () => {
      expect(() => assertBaseNetwork("eip155:8453", "test")).not.toThrow();
      expect(() => assertBaseNetwork("eip155:84532", "test")).not.toThrow();
    });

    it("throws with the offending network and operation name for off-Base networks", () => {
      expect(() => assertBaseNetwork("eip155:1", "BaseScheme.createPaymentPayload")).toThrow(
        /BaseScheme\.createPaymentPayload/,
      );
      expect(() => assertBaseNetwork("eip155:1", "BaseScheme.createPaymentPayload")).toThrow(
        /eip155:1/,
      );
    });

    it("throws for non-EVM networks", () => {
      expect(() => assertBaseNetwork("solana:mainnet", "test")).toThrow(/solana:mainnet/);
    });
  });

  describe("findBaseDefaultAsset", () => {
    const usdcMainnet = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const usdcSepolia = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

    it("resolves known default assets on Base mainnet", () => {
      const asset = findBaseDefaultAsset(usdcMainnet, "eip155:8453");
      expect(asset).toBeDefined();
      expect(asset?.symbol).toBe("USDC");
    });

    it("resolves known default assets on Base Sepolia", () => {
      const asset = findBaseDefaultAsset(usdcSepolia, "eip155:84532");
      expect(asset).toBeDefined();
      expect(asset?.symbol).toBe("USDC");
    });

    it("returns undefined for an unrecognized asset on a Base network", () => {
      expect(
        findBaseDefaultAsset("0x0000000000000000000000000000000000dEaD", "eip155:8453"),
      ).toBeUndefined();
    });

    it("returns undefined off-Base even for an asset address that is a known default elsewhere", () => {
      // Same USDC address, but on a network @x402/base is not scoped to.
      expect(findBaseDefaultAsset(usdcMainnet, "eip155:1")).toBeUndefined();
    });
  });
});
