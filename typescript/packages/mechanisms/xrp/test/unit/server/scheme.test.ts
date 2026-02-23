import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactXrpScheme } from "../../../src/exact/server/scheme";
import { Network, PaymentRequirements } from "@x402/core/types";

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

      // Result should be an AssetAmount with correct properties
      expect(result).toHaveProperty("amount");
      expect(result).toHaveProperty("asset");
      expect(result).toHaveProperty("extra");
      expect(result.asset).toBe("XRP");
      expect(BigInt(result.amount)).toBeGreaterThan(0);
    });

    it("should parse decimal string amount", async () => {
      const result = await scheme.parsePrice("0.01", "xrp:testnet" as Network);

      expect(result.asset).toBe("XRP");
      expect(result).toHaveProperty("amount");
      expect(result).toHaveProperty("extra");
    });

    it("should handle AssetAmount object", async () => {
      const assetAmount = {
        amount: "50000",
        asset: "XRP",
      };

      const result = await scheme.parsePrice(assetAmount, "xrp:mainnet" as Network);

      expect(result.amount).toBe("50000");
      expect(result.asset).toBe("XRP");
      expect(result).toHaveProperty("extra");
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

      expect(result.amount).toBe("1000000");
      expect(result.asset).toBe("XRP");
      expect(result.extra).toEqual({
        destinationTag: 12345,
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
        expect(result.amount).toBeDefined();
        expect(result.asset).toBe("XRP");
      }
    });

    it("should parse numeric amount", async () => {
      const result = await scheme.parsePrice(1.5, "xrp:testnet" as Network);

      expect(result.asset).toBe("XRP");
      expect(result.amount).toBeDefined();
    });

    it("should throw error for invalid money format", async () => {
      await expect(scheme.parsePrice("not-a-number", "xrp:testnet" as Network)).rejects.toThrow(
        "Invalid money format"
      );
    });

    it("should handle money with dollar sign", async () => {
      const result = await scheme.parsePrice("$1.00", "xrp:testnet" as Network);

      expect(result.asset).toBe("XRP");
      expect(result.amount).toBeDefined();
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

      const result = scheme.registerMoneyParser(parser1).registerMoneyParser(parser2);

      expect(result).toBe(scheme);
    });

    it("should use custom parser when provided", async () => {
      const customParser = vi.fn().mockResolvedValue({
        amount: "99999",
        asset: "CUSTOM",
        extra: {},
      });

      scheme.registerMoneyParser(customParser);

      const result = await scheme.parsePrice("1", "xrp:testnet" as Network);

      expect(customParser).toHaveBeenCalled();
      expect(result.asset).toBe("CUSTOM");
      expect(result.amount).toBe("99999");
    });
  });

  describe("enhancePaymentRequirements", () => {
    it("should return requirements as-is (no enhancement needed for XRP)", async () => {
      const baseRequirements: PaymentRequirements = {
        scheme: "exact",
        network: "xrp:testnet",
        amount: "10000",
        asset: "XRP",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
      };

      const supportedKind = {
        x402Version: 2,
        scheme: "exact",
        network: "xrp:testnet" as Network,
      };

      const result = await scheme.enhancePaymentRequirements(baseRequirements, supportedKind, []);

      expect(result).toEqual(baseRequirements);
    });

    it("should preserve extra fields in requirements", async () => {
      const baseRequirements: PaymentRequirements = {
        scheme: "exact",
        network: "xrp:testnet",
        amount: "10000",
        asset: "XRP",
        payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
        extra: {
          destinationTag: 12345,
          memo: {
            memoType: "x402_payment",
            memoData: "74657374",
          },
        },
      };

      const supportedKind = {
        x402Version: 2,
        scheme: "exact",
        network: "xrp:testnet" as Network,
      };

      const result = await scheme.enhancePaymentRequirements(baseRequirements, supportedKind, []);

      expect(result.extra).toEqual(baseRequirements.extra);
    });

    it("should handle all XRP networks", async () => {
      const networks: Network[] = ["xrp:mainnet", "xrp:testnet", "xrp:devnet"];

      for (const network of networks) {
        const baseRequirements: PaymentRequirements = {
          scheme: "exact",
          network,
          amount: "10000",
          asset: "XRP",
          payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
        };

        const supportedKind = {
          x402Version: 2,
          scheme: "exact",
          network,
        };

        const result = await scheme.enhancePaymentRequirements(baseRequirements, supportedKind, []);
        expect(result).toEqual(baseRequirements);
      }
    });
  });
});
