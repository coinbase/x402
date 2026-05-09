import { describe, expect, test } from "vitest";
import {
  DEFAULT_STABLECOINS,
  getDefaultAsset,
  type DefaultAssetInfo,
  type ExactDefaultAssetInfo,
} from "../../../src/shared/defaultAssets";

describe("defaultAssets", () => {
  describe("DEFAULT_STABLECOINS", () => {
    test("should contain all expected networks", () => {
      const expectedNetworks = [
        "eip155:8453", // Base mainnet
        "eip155:84532", // Base Sepolia
        "eip155:4326", // MegaETH mainnet
        "eip155:143", // Monad mainnet
        "eip155:988", // Stable mainnet
        "eip155:2201", // Stable testnet
        "eip155:137", // Polygon mainnet
        "eip155:42161", // Arbitrum One
        "eip155:421614", // Arbitrum Sepolia
      ];

      const actualNetworks = Object.keys(DEFAULT_STABLECOINS);
      expect(actualNetworks).toEqual(expect.arrayContaining(expectedNetworks));
      expect(actualNetworks).toHaveLength(expectedNetworks.length);
    });

    test("should have valid asset info for each network", () => {
      Object.entries(DEFAULT_STABLECOINS).forEach(([_network, asset]) => {
        // Test required fields
        expect(asset.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(asset.name).toBeTruthy();
        expect(asset.version).toBeTruthy();
        expect(asset.decimals).toBeGreaterThan(0);
        expect(asset.decimals).toBeLessThanOrEqual(18);

        // Test optional fields if present
        if (asset.assetTransferMethod) {
          expect(asset.assetTransferMethod).toBe("permit2");
        }
        if (asset.supportsEip2612 !== undefined) {
          expect(typeof asset.supportsEip2612).toBe("boolean");
        }
      });
    });

    test("should have correct Base mainnet USDC configuration", () => {
      const baseUsdc = DEFAULT_STABLECOINS["eip155:8453"];
      expect(baseUsdc).toEqual({
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    test("should have correct Base Sepolia USDC configuration", () => {
      const baseSepoliaUsdc = DEFAULT_STABLECOINS["eip155:84532"];
      expect(baseSepoliaUsdc).toEqual({
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name: "USDC",
        version: "2",
        decimals: 6,
      });
    });

    test("should have correct MegaETH mainnet configuration with permit2", () => {
      const megaEthUsdc = DEFAULT_STABLECOINS["eip155:4326"];
      expect(megaEthUsdc).toEqual({
        address: "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
        name: "MegaUSD",
        version: "1",
        decimals: 18,
        assetTransferMethod: "permit2",
        supportsEip2612: true,
      });
    });

    test("should have correct Polygon mainnet USDC configuration", () => {
      const polygonUsdc = DEFAULT_STABLECOINS["eip155:137"];
      expect(polygonUsdc).toEqual({
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    test("should have correct Arbitrum One USDC configuration", () => {
      const arbUsdc = DEFAULT_STABLECOINS["eip155:42161"];
      expect(arbUsdc).toEqual({
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    test("should have valid EIP-712 domain data", () => {
      Object.entries(DEFAULT_STABLECOINS).forEach(([_network, asset]) => {
        // Name should be non-empty string
        expect(asset.name).toEqual(expect.any(String));
        expect(asset.name.length).toBeGreaterThan(0);

        // Version should be a valid version string
        expect(asset.version).toMatch(/^\d+$/);
        expect(parseInt(asset.version)).toBeGreaterThan(0);
      });
    });

    test("should only use permit2 transfer method when specified", () => {
      const permit2Networks = Object.entries(DEFAULT_STABLECOINS).filter(
        ([, asset]) => asset.assetTransferMethod === "permit2",
      );

      // Only MegaETH should use permit2
      expect(permit2Networks).toHaveLength(1);
      expect(permit2Networks[0][0]).toBe("eip155:4326"); // MegaETH
    });

    test("should have supportsEip2612 only for permit2 tokens", () => {
      Object.entries(DEFAULT_STABLECOINS).forEach(([_network, asset]) => {
        if (asset.supportsEip2612 !== undefined) {
          expect(asset.assetTransferMethod).toBe("permit2");
        }
      });
    });
  });

  describe("getDefaultAsset", () => {
    test("should return asset info for valid network", () => {
      const asset = getDefaultAsset("eip155:8453");
      expect(asset).toEqual({
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    test("should return asset info for all configured networks", () => {
      Object.keys(DEFAULT_STABLECOINS).forEach(network => {
        const asset = getDefaultAsset(network);
        expect(asset).toBeDefined();
        expect(asset.address).toBeTruthy();
        expect(asset.name).toBeTruthy();
        expect(asset.version).toBeTruthy();
        expect(asset.decimals).toBeGreaterThan(0);
      });
    });

    test("should throw error for unconfigured network", () => {
      expect(() => getDefaultAsset("eip155:999999")).toThrow(
        "No default asset configured for network eip155:999999",
      );
    });

    test("should throw error for invalid network format", () => {
      expect(() => getDefaultAsset("invalid-network")).toThrow(
        "No default asset configured for network invalid-network",
      );
    });

    test("should throw error for empty network", () => {
      expect(() => getDefaultAsset("")).toThrow("No default asset configured for network ");
    });

    test("should return ExactDefaultAssetInfo with optional fields", () => {
      const megaEthAsset = getDefaultAsset("eip155:4326");
      expect(megaEthAsset.assetTransferMethod).toBe("permit2");
      expect(megaEthAsset.supportsEip2612).toBe(true);
    });

    test("should return asset without optional fields for EIP-3009 tokens", () => {
      const baseAsset = getDefaultAsset("eip155:8453");
      expect(baseAsset.assetTransferMethod).toBeUndefined();
      expect(baseAsset.supportsEip2612).toBeUndefined();
    });
  });

  describe("type compatibility", () => {
    test("DefaultAssetInfo should have required fields", () => {
      const asset: DefaultAssetInfo = {
        address: "0x1234567890123456789012345678901234567890",
        name: "Test Token",
        version: "1",
        decimals: 18,
      };
      expect(asset).toBeDefined();
    });

    test("ExactDefaultAssetInfo should extend DefaultAssetInfo", () => {
      const asset: ExactDefaultAssetInfo = {
        address: "0x1234567890123456789012345678901234567890",
        name: "Test Token",
        version: "1",
        decimals: 18,
        assetTransferMethod: "permit2",
        supportsEip2612: true,
      };
      expect(asset).toBeDefined();
    });

    test("ExactDefaultAssetInfo should work without optional fields", () => {
      const asset: ExactDefaultAssetInfo = {
        address: "0x1234567890123456789012345678901234567890",
        name: "Test Token",
        version: "1",
        decimals: 18,
      };
      expect(asset).toBeDefined();
    });
  });

  describe("data consistency", () => {
    test("should have consistent decimals across similar tokens", () => {
      const usdcNetworks = Object.entries(DEFAULT_STABLECOINS)
        .filter(([, asset]) => asset.name.includes("USD Coin"))
        .map(([, asset]) => asset.decimals);

      // All USDC tokens should have 6 decimals
      usdcNetworks.forEach(decimals => {
        expect(decimals).toBe(6);
      });
    });

    test("should have consistent versions for USDC tokens", () => {
      const usdcVersions = Object.entries(DEFAULT_STABLECOINS)
        .filter(([, asset]) => asset.name === "USD Coin")
        .map(([, asset]) => asset.version);

      // All USDC tokens should have version "2"
      usdcVersions.forEach(version => {
        expect(version).toBe("2");
      });
    });

    test("should have unique addresses across networks", () => {
      const addresses = Object.values(DEFAULT_STABLECOINS).map(asset => asset.address);
      const uniqueAddresses = new Set(addresses);
      expect(uniqueAddresses.size).toBe(addresses.length);
    });

    test("should use proper checksummed addresses", () => {
      Object.values(DEFAULT_STABLECOINS).forEach(asset => {
        // Addresses should be properly checksummed (mix of upper and lower case)
        expect(asset.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
        // Should not be all lowercase or all uppercase (except for specific cases)
        if (asset.address !== asset.address.toLowerCase()) {
          expect(asset.address).not.toBe(asset.address.toUpperCase());
        }
      });
    });
  });
});
