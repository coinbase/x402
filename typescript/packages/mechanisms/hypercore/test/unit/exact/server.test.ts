import { describe, it, expect } from "vitest";
import { ExactHypercoreScheme } from "../../../src/exact/server/scheme.js";

describe("ExactHypercoreScheme (Server)", () => {
  const server = new ExactHypercoreScheme();

  it("should have correct scheme", () => {
    expect(server.scheme).toBe("exact");
  });

  describe("parsePrice", () => {
    it("should return AssetAmount as-is", async () => {
      const price = {
        amount: "10000",
        asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
      };

      const result = await server.parsePrice(price, "hypercore:mainnet");

      expect(result.amount).toBe(price.amount);
      expect(result.asset).toBe(price.asset);
    });

    it("should parse dollar amount string", async () => {
      const result = await server.parsePrice("$0.01", "hypercore:mainnet");

      expect(result.amount).toBe("1000000");
      expect(result.asset).toBe("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b");
    });

    it("should parse plain number string", async () => {
      const result = await server.parsePrice("1.5", "hypercore:mainnet");

      expect(result.amount).toBe("150000000");
      expect(result.asset).toBe("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b");
    });

    it("should parse number", async () => {
      const result = await server.parsePrice(0.01, "hypercore:mainnet");

      expect(result.amount).toBe("1000000");
      expect(result.asset).toBe("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b");
    });

    it("should handle USD suffix", async () => {
      const result = await server.parsePrice("$0.01 USD", "hypercore:mainnet");

      expect(result.amount).toBe("1000000");
      expect(result.asset).toBe("USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b");
    });

    it("should throw on invalid price", async () => {
      await expect(server.parsePrice("invalid", "hypercore:mainnet")).rejects.toThrow();
    });
  });

  describe("enhancePaymentRequirements", () => {
    it("should add Hypercore-specific metadata", async () => {
      const requirements = {
        scheme: "exact" as const,
        network: "hypercore:mainnet" as const,
        payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount: "10000",
        asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        maxTimeoutSeconds: 3600,
        extra: {},
      };

      const supportedKind = {
        x402Version: 2,
        scheme: "exact" as const,
        network: "hypercore:mainnet" as const,
      };

      const result = await server.enhancePaymentRequirements(requirements, supportedKind, []);

      expect(result.extra).toBeDefined();
      expect(result.extra?.signatureChainId).toBe(999);
      expect(result.extra?.isMainnet).toBe(true);
    });

    it("should set isMainnet false for testnet", async () => {
      const requirements = {
        scheme: "exact" as const,
        network: "hypercore:testnet" as const,
        payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount: "10000",
        asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        maxTimeoutSeconds: 3600,
        extra: {},
      };

      const supportedKind = {
        x402Version: 2,
        scheme: "exact" as const,
        network: "hypercore:testnet" as const,
      };

      const result = await server.enhancePaymentRequirements(requirements, supportedKind, []);

      expect(result.extra?.isMainnet).toBe(false);
    });

    it("should preserve existing extra fields", async () => {
      const requirements = {
        scheme: "exact" as const,
        network: "hypercore:mainnet" as const,
        payTo: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        amount: "10000",
        asset: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
        maxTimeoutSeconds: 3600,
        extra: { customField: "value" },
      };

      const supportedKind = {
        x402Version: 2,
        scheme: "exact" as const,
        network: "hypercore:mainnet" as const,
      };

      const result = await server.enhancePaymentRequirements(requirements, supportedKind, []);

      expect(result.extra?.customField).toBe("value");
      expect(result.extra?.signatureChainId).toBe(999);
    });
  });
});
