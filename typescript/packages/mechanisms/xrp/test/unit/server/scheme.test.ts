import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactXrpScheme } from "../../../src/exact/server/scheme";
import { Network } from "@x402/core/types";

describe("ExactXrpScheme Server", () => {
  let scheme: ExactXrpScheme;

  beforeEach(() => {
    scheme = new ExactXrpScheme();
  });

  describe("scheme property", () => {
    it("should return exact scheme", () => {
      expect(scheme.scheme).toBe("exact");
    });
  });

  describe("parsePrice", () => {
    it("should parse string amount to drops", async () => {
      const result = await scheme.parsePrice("1", "xrp:testnet" as Network);
      
      expect(result).toEqual({
        amount: "1000000", // 1 XRP = 1,000,000 drops
        asset: "XRP",
        extra: {},
      });
    });

    it("should parse decimal string amount", async () => {
      const result = await scheme.parsePrice("0.01", "xrp:testnet" as Network);
      
      expect(result).toEqual({
        amount: "10000", // 0.01 XRP = 10,000 drops
        asset: "XRP",
        extra: {},
      });
    });

    it("should handle AssetAmount object", async () => {
      const assetAmount = {
        amount: "50000",
        asset: "XRP",
      };

      const result = await scheme.parsePrice(assetAmount, "xrp:mainnet" as Network);
      
      expect(result).toEqual({
        amount: "50000",
        asset: "XRP",
        extra: {},
      });
    });

    it("should handle AssetAmount with extra", async () => {
      const assetAmount = {
        amount: "1000000",
        asset: "XRP",
        extra: {
          destinationTag: 12345,
        },
      };

      const result = await scheme.parsePrice(assetAmount, "xrp:testnet" as Network);
      
      expect(result).toEqual({
        amount: "1000000",
        asset: "XRP",
        extra: {
          destinationTag: 12345,
        },
      });
    });

    it("should default asset to XRP", async () => {
      const assetAmount = {
        amount: "10000",
      };

      const result = await scheme.parsePrice(assetAmount, "xrp:testnet" as Network);
      
      expect(result.asset).toBe("XRP");
    });

    it("should handle all XRP network identifiers", async () => {
      const networks = ["xrp:mainnet", "xrp:testnet", "xrp:devnet"];
      
      for (const network of networks) {
        const result = await scheme.parsePrice("1", network as Network);
        expect(result.amount).toBe("1000000");
      }
    });
  });

  describe("registerMoneyParser", () => {
    it("should register custom parser", () => {
      const customParser = () => null;
      
      const result = scheme.registerMoneyParser(customParser);
      
      expect(result).toBe(scheme); // Returns self for chaining
    });

    it("should chain multiple parsers", () => {
      const parser1 = () => null;
      const parser2 = () => null;
      
      const result = scheme
        .registerMoneyParser(parser1)
        .registerMoneyParser(parser2);
      
      expect(result).toBe(scheme);
    });
  });

  describe("buildRequirements", () => {
    it("should build basic payment requirements", async () => {
      const params = {
        network: "xrp:testnet" as Network,
        amount: "$0.01",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      };

      const result = await scheme.buildRequirements(params);

      expect(result).toEqual({
        scheme: "exact",
        network: "xrp:testnet",
        amount: expect.any(String),
        asset: "XRP",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      });
    });

    it("should include description if provided", async () => {
      const params = {
        network: "xrp:testnet" as Network,
        amount: "10000",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
        description: "Test payment",
      };

      const result = await scheme.buildRequirements(params);

      expect(result.description).toBe("Test payment");
    });

    it("should include maxTimeoutSeconds if provided", async () => {
      const params = {
        network: "xrp:testnet" as Network,
        amount: "10000",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
        maxTimeoutSeconds: 120,
      };

      const result = await scheme.buildRequirements(params);

      expect(result.maxTimeoutSeconds).toBe(120);
    });

    it("should include extra parameters", async () => {
      const params = {
        network: "xrp:testnet" as Network,
        amount: "10000",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
        extra: {
          destinationTag: 12345,
          memo: {
            memoType: "x402_payment",
            memoData: "74657374",
          },
        },
      };

      const result = await scheme.buildRequirements(params);

      expect(result.extra).toEqual({
        destinationTag: 12345,
        memo: {
          memoType: "x402_payment",
          memoData: "74657374",
        },
      });
    });

    it("should handle AssetAmount input", async () => {
      const params = {
        network: "xrp:mainnet" as Network,
        amount: {
          amount: "5000000",
          asset: "XRP",
        },
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      };

      const result = await scheme.buildRequirements(params);

      expect(result.amount).toBe("5000000");
      expect(result.asset).toBe("XRP");
    });

    it("should reject non-XRP networks", async () => {
      const params = {
        network: "eip155:1" as Network, // Ethereum mainnet
        amount: "10000",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      };

      await expect(scheme.buildRequirements(params)).rejects.toThrow();
    });

    it("should reject invalid XRP addresses", async () => {
      const params = {
        network: "xrp:testnet" as Network,
        amount: "10000",
        payTo: "invalid-address",
      };

      await expect(scheme.buildRequirements(params)).rejects.toThrow();
    });
  });
});
