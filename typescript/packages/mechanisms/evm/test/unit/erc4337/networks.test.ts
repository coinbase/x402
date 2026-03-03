import { describe, it, expect } from "vitest";
import {
  SUPPORTED_CHAINS,
  resolveChainId,
  getChain,
  getChainById,
  isSupported,
  parseCAIP2,
  toCAIP2,
  getSupportedChains,
  getMainnets,
  getTestnets,
  getV1Name,
  getV1Names,
} from "../../../src/erc4337/networks";

describe("networks/registry", () => {
  it("should have Base mainnet", () => {
    expect(SUPPORTED_CHAINS[8453]).toBeDefined();
    expect(SUPPORTED_CHAINS[8453].name).toBe("Base");
    expect(SUPPORTED_CHAINS[8453].testnet).toBe(false);
  });

  it("should have Base Sepolia testnet", () => {
    expect(SUPPORTED_CHAINS[84532]).toBeDefined();
    expect(SUPPORTED_CHAINS[84532].name).toBe("Base Sepolia");
    expect(SUPPORTED_CHAINS[84532].testnet).toBe(true);
  });

  it("should have Optimism", () => {
    expect(SUPPORTED_CHAINS[10]).toBeDefined();
    expect(SUPPORTED_CHAINS[10].name).toBe("Optimism");
  });

  it("should have Arbitrum", () => {
    expect(SUPPORTED_CHAINS[42161]).toBeDefined();
    expect(SUPPORTED_CHAINS[42161].name).toBe("Arbitrum One");
  });

  it("should have 6 supported chains", () => {
    expect(Object.keys(SUPPORTED_CHAINS)).toHaveLength(6);
  });
});

describe("networks/helpers", () => {
  describe("parseCAIP2", () => {
    it("should parse valid CAIP-2", () => {
      expect(parseCAIP2("eip155:8453")).toBe(8453);
      expect(parseCAIP2("eip155:84532")).toBe(84532);
    });

    it("should throw on invalid CAIP-2", () => {
      expect(() => parseCAIP2("invalid")).toThrow();
      expect(() => parseCAIP2("eip155:")).toThrow();
    });
  });

  describe("toCAIP2", () => {
    it("should convert chain ID to CAIP-2", () => {
      expect(toCAIP2(8453)).toBe("eip155:8453");
    });
  });

  describe("resolveChainId", () => {
    it("should resolve from CAIP-2", () => {
      expect(resolveChainId("eip155:8453")).toBe(8453);
    });

    it("should resolve from number", () => {
      expect(resolveChainId(8453)).toBe(8453);
    });

    it("should resolve from v1 name", () => {
      expect(resolveChainId("base")).toBe(8453);
      expect(resolveChainId("base-sepolia")).toBe(84532);
    });

    it("should throw on unknown name", () => {
      expect(() => resolveChainId("unknown-chain")).toThrow();
    });
  });

  describe("getChain", () => {
    it("should get chain by CAIP-2", () => {
      const chain = getChain("eip155:8453");
      expect(chain.chainId).toBe(8453);
    });

    it("should get chain by v1 name", () => {
      const chain = getChain("base");
      expect(chain.chainId).toBe(8453);
    });

    it("should throw for unsupported chain", () => {
      expect(() => getChain("eip155:999999")).toThrow();
    });
  });

  describe("getChainById", () => {
    it("should return chain for valid ID", () => {
      expect(getChainById(8453)).toBeDefined();
    });

    it("should return undefined for invalid ID", () => {
      expect(getChainById(999999)).toBeUndefined();
    });
  });

  describe("isSupported", () => {
    it("should return true for supported chains", () => {
      expect(isSupported(8453)).toBe(true);
      expect(isSupported(84532)).toBe(true);
    });

    it("should return false for unsupported chains", () => {
      expect(isSupported(999999)).toBe(false);
    });
  });

  describe("getSupportedChains", () => {
    it("should return all chains", () => {
      expect(getSupportedChains()).toHaveLength(6);
    });
  });

  describe("getMainnets", () => {
    it("should return only mainnets", () => {
      const mainnets = getMainnets();
      expect(mainnets.every(c => !c.testnet)).toBe(true);
      expect(mainnets.length).toBe(3);
    });
  });

  describe("getTestnets", () => {
    it("should return only testnets", () => {
      const testnets = getTestnets();
      expect(testnets.every(c => c.testnet)).toBe(true);
      expect(testnets.length).toBe(3);
    });
  });

  describe("getV1Name", () => {
    it("should return v1 name for known chain", () => {
      expect(getV1Name(8453)).toBe("base");
    });

    it("should return undefined for unknown chain", () => {
      expect(getV1Name(999999)).toBeUndefined();
    });
  });

  describe("getV1Names", () => {
    it("should return array with v1 name for known chain", () => {
      expect(getV1Names(8453)).toEqual(["base"]);
    });

    it("should return empty array for unknown chain", () => {
      expect(getV1Names(999999)).toEqual([]);
    });
  });
});
