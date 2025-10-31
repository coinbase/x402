import { describe, it, expect } from "vitest";
import { X402Config, SvmConfig, EvmConfig } from "./config";

describe("X402Config Types", () => {
  describe("SvmConfig", () => {
    it("should accept valid SvmConfig with rpcUrl", () => {
      const svmConfig: SvmConfig = {
        "solana-devnet": {
          rpcUrl: "http://localhost:8899",
        },
      };

      expect(svmConfig["solana-devnet"]?.rpcUrl).toBe("http://localhost:8899");
    });

    it("should accept empty SvmConfig", () => {
      const svmConfig: SvmConfig = {};

      expect(svmConfig["solana-devnet"]).toBeUndefined();
    });
  });

  describe("EvmConfig", () => {
    it("should accept valid SvmConfig with rpcUrl", () => {
      const evmConfig: EvmConfig = {
        "base-sepolia": {
          rpcUrl: "http://localhost:8899",
        },
      };

      expect(evmConfig["base-sepolia"]?.rpcUrl).toBe("http://localhost:8899");
    });

    it("should accept empty SvmConfig", () => {
      const evmConfig: EvmConfig = {};

      expect(evmConfig["base-sepolia"]).toBeUndefined();
    });
  });

  describe("X402Config", () => {
    it("should accept valid X402Config with svmConfig", () => {
      const x402Config: X402Config = {
        svmConfig: {
          solana: {
            rpcUrl: "https://api.mainnet-beta.solana.com",
          },
        },
        evmConfig: {
          base: {
            rpcUrl: "https://mainnet.base.org",
          },
        },
      };

      expect(x402Config.svmConfig?.["solana"]?.rpcUrl).toBe("https://api.mainnet-beta.solana.com");
      expect(x402Config.evmConfig?.["base"]?.rpcUrl).toBe("https://mainnet.base.org");
    });

    it("should accept empty X402Config", () => {
      const x402Config: X402Config = {};

      expect(x402Config.svmConfig).toBeUndefined();
      expect(x402Config.evmConfig).toBeUndefined();
    });

    it("should accept X402Config with empty svmConfig", () => {
      const x402Config: X402Config = {
        svmConfig: {},
      };

      expect(x402Config.svmConfig).toBeDefined();
      expect(x402Config.svmConfig?.["solana-devnet"]?.rpcUrl).toBeUndefined();
    });

    it("should accept X402Config with empty evmConfig", () => {
      const x402Config: X402Config = {
        evmConfig: {},
      };

      expect(x402Config.evmConfig).toBeDefined();
      expect(x402Config.evmConfig?.["base"]?.rpcUrl).toBeUndefined();
    });

    it("should handle optional chaining correctly", () => {
      const config1: X402Config = {};
      const config2: X402Config = { svmConfig: {}, evmConfig: {} };
      const config3: X402Config = {
        svmConfig: { "solana-devnet": { rpcUrl: "http://localhost:8899" } },
        evmConfig: { base: { rpcUrl: "https://mainnet.base.org" } },
      };

      expect(config1.svmConfig?.["solana-devnet"]?.rpcUrl).toBeUndefined();
      expect(config2.svmConfig?.["solana-devnet"]?.rpcUrl).toBeUndefined();
      expect(config3.svmConfig?.["solana-devnet"]?.rpcUrl).toBe("http://localhost:8899");

      expect(config1.evmConfig?.["base"]?.rpcUrl).toBeUndefined();
      expect(config2.evmConfig?.["base"]?.rpcUrl).toBeUndefined();
      expect(config3.evmConfig?.["base"]?.rpcUrl).toBe("https://mainnet.base.org");
    });
  });
});
