import { describe, it, expect } from "vitest";
import { ExactEvmScheme } from "../../src/exact/server/scheme";

describe("ExactEvmScheme (Server)", () => {
  const server = new ExactEvmScheme();

  describe("parsePrice", () => {
    describe("Base Sepolia network", () => {
      const network = "eip155:84532";

      it("should parse dollar string prices", async () => {
        const result = await server.parsePrice("$0.10", network);
        expect(result.amount).toBe("100000"); // 0.10 USDC = 100000 smallest units
        expect(result.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
        expect(result.extra).toEqual({ name: "USDC", version: "2" });
      });

      it("should parse simple number string prices", async () => {
        const result = await server.parsePrice("0.10", network);
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
      });

      it("should parse number prices", async () => {
        const result = await server.parsePrice(0.1, network);
        expect(result.amount).toBe("100000");
        expect(result.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
      });

      it("should handle larger amounts", async () => {
        const result = await server.parsePrice("100.50", network);
        expect(result.amount).toBe("100500000"); // 100.50 USDC
      });

      it("should handle whole numbers", async () => {
        const result = await server.parsePrice("1", network);
        expect(result.amount).toBe("1000000"); // 1 USDC
      });

      it("should avoid floating-point rounding error", async () => {
        const result = await server.parsePrice("$4.02", network);
        expect(result.amount).toBe("4020000"); // 4.02 USDC
      });
    });

    describe("Base mainnet network", () => {
      const network = "eip155:8453";

      it("should use Base mainnet USDC address", async () => {
        const result = await server.parsePrice("1.00", network);
        expect(result.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
        expect(result.amount).toBe("1000000");
        expect(result.extra).toEqual({ name: "USD Coin", version: "2" });
      });
    });

    describe("Ethereum mainnet network", () => {
      const network = "eip155:1";

      it("should use Ethereum mainnet USDC address", async () => {
        const result = await server.parsePrice("1.00", network);
        expect(result.asset).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
        expect(result.amount).toBe("1000000");
        expect(result.extra).toEqual({ name: "USD Coin", version: "2" });
      });
    });

    describe("Sepolia testnet network", () => {
      const network = "eip155:11155111";

      it("should use Sepolia USDC address", async () => {
        const result = await server.parsePrice("1.00", network);
        expect(result.asset).toBe("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238");
        expect(result.amount).toBe("1000000");
        expect(result.extra).toEqual({ name: "USDC", version: "2" });
      });
    });

    describe("pre-parsed price objects", () => {
      it("should handle pre-parsed price objects with asset", async () => {
        const result = await server.parsePrice(
          {
            amount: "123456",
            asset: "0x1234567890123456789012345678901234567890",
            extra: { foo: "bar" },
          },
          "eip155:84532",
        );
        expect(result.amount).toBe("123456");
        expect(result.asset).toBe("0x1234567890123456789012345678901234567890");
        expect(result.extra).toEqual({ foo: "bar" });
      });

      it("should throw for price objects without asset", async () => {
        await expect(
          async () => await server.parsePrice({ amount: "123456" } as never, "eip155:84532"),
        ).rejects.toThrow("Asset address must be specified");
      });
    });

    describe("error cases", () => {
      it("should throw for unsupported networks", async () => {
        await expect(async () => await server.parsePrice("1.00", "eip155:999999")).rejects.toThrow(
          "No default asset configured",
        );
      });

      it("should throw for invalid money formats", async () => {
        await expect(
          async () => await server.parsePrice("not-a-price!", "eip155:84532"),
        ).rejects.toThrow("Invalid money format");
      });

      it("should throw for invalid amounts", async () => {
        await expect(async () => await server.parsePrice("abc", "eip155:84532")).rejects.toThrow(
          "Invalid money format",
        );
      });
    });
  });

  describe("enhancePaymentRequirements", () => {
    it("should return payment requirements unchanged", async () => {
      const requirements = {
        scheme: "exact",
        network: "eip155:84532",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      const result = await server.enhancePaymentRequirements(
        requirements as never,
        {
          x402Version: 2,
          scheme: "exact",
          network: "eip155:84532",
        },
        [],
      );

      expect(result).toEqual(requirements);
    });
  });
});
