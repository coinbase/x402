import { describe, it, expect } from "vitest";
import {
  DEFAULT_STABLECOINS,
  getDefaultAsset,
  type ExactDefaultAssetInfo,
} from "../../src/shared/defaultAssets";

describe("Default Assets", () => {
  describe("DEFAULT_STABLECOINS constant", () => {
    it("should contain all expected mainnet networks", () => {
      // Verify mainnet networks are present
      expect(DEFAULT_STABLECOINS["eip155:8453"]).toBeDefined(); // Base mainnet
      expect(DEFAULT_STABLECOINS["eip155:143"]).toBeDefined(); // Monad mainnet
      expect(DEFAULT_STABLECOINS["eip155:988"]).toBeDefined(); // Stable mainnet
      expect(DEFAULT_STABLECOINS["eip155:4326"]).toBeDefined(); // MegaETH mainnet
      expect(DEFAULT_STABLECOINS["eip155:137"]).toBeDefined(); // Polygon mainnet
      expect(DEFAULT_STABLECOINS["eip155:42161"]).toBeDefined(); // Arbitrum One
    });

    it("should contain all expected testnet networks", () => {
      // Verify testnet networks are present
      expect(DEFAULT_STABLECOINS["eip155:84532"]).toBeDefined(); // Base Sepolia
      expect(DEFAULT_STABLECOINS["eip155:2201"]).toBeDefined(); // Stable testnet
      expect(DEFAULT_STABLECOINS["eip155:421614"]).toBeDefined(); // Arbitrum Sepolia
    });

    it("should have valid asset configuration for each network", () => {
      Object.entries(DEFAULT_STABLECOINS).forEach(([network, asset]) => {
        // Verify network format
        expect(network).toMatch(/^eip155:\d+$/);

        // Verify required fields are present and valid
        expect(asset.address).toMatch(/^0x[0-9a-fA-F]{40}$/); // Valid Ethereum address
        expect(typeof asset.name).toBe("string");
        expect(asset.name.length).toBeGreaterThan(0);
        expect(typeof asset.version).toBe("string");
        expect(asset.version.length).toBeGreaterThan(0);
        expect(typeof asset.decimals).toBe("number");
        expect(asset.decimals).toBeGreaterThanOrEqual(0);
        expect(asset.decimals).toBeLessThanOrEqual(18);

        // Verify optional fields are valid when present
        if (asset.assetTransferMethod) {
          expect(typeof asset.assetTransferMethod).toBe("string");
          expect(asset.assetTransferMethod).toBe("permit2"); // Only supported value currently
        }

        if (asset.supportsEip2612 !== undefined) {
          expect(typeof asset.supportsEip2612).toBe("boolean");
        }
      });
    });

    it("should have correct configuration for Base mainnet USDC", () => {
      const baseMainnet = DEFAULT_STABLECOINS["eip155:8453"];
      expect(baseMainnet).toEqual({
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should have correct configuration for Base Sepolia USDC", () => {
      const baseSepolia = DEFAULT_STABLECOINS["eip155:84532"];
      expect(baseSepolia).toEqual({
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name: "USDC",
        version: "2",
        decimals: 6,
      });
    });

    it("should have correct configuration for MegaETH mainnet MegaUSD", () => {
      const megaEthMainnet = DEFAULT_STABLECOINS["eip155:4326"];
      expect(megaEthMainnet).toEqual({
        address: "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
        name: "MegaUSD",
        version: "1",
        decimals: 18,
        assetTransferMethod: "permit2",
        supportsEip2612: true,
      });
    });

    it("should have correct configuration for Arbitrum One USDC", () => {
      const arbitrumOne = DEFAULT_STABLECOINS["eip155:42161"];
      expect(arbitrumOne).toEqual({
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should have correct configuration for Arbitrum Sepolia USDC", () => {
      const arbitrumSepolia = DEFAULT_STABLECOINS["eip155:421614"];
      expect(arbitrumSepolia).toEqual({
        address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should have correct configuration for Stable mainnet USDT0", () => {
      const stableMainnet = DEFAULT_STABLECOINS["eip155:988"];
      expect(stableMainnet).toEqual({
        address: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
        name: "USDT0",
        version: "1",
        decimals: 6,
      });
    });

    it("should have correct configuration for Stable testnet USDT0", () => {
      const stableTestnet = DEFAULT_STABLECOINS["eip155:2201"];
      expect(stableTestnet).toEqual({
        address: "0x78Cf24370174180738C5B8E352B6D14c83a6c9A9",
        name: "USDT0",
        version: "1",
        decimals: 6,
      });
    });

    it("should have correct configuration for Polygon mainnet USDC", () => {
      const polygonMainnet = DEFAULT_STABLECOINS["eip155:137"];
      expect(polygonMainnet).toEqual({
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should have correct configuration for Monad mainnet USDC", () => {
      const monadMainnet = DEFAULT_STABLECOINS["eip155:143"];
      expect(monadMainnet).toEqual({
        address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });
  });

  describe("getDefaultAsset function", () => {
    it("should return correct asset for Base mainnet", () => {
      const asset = getDefaultAsset("eip155:8453");
      expect(asset).toEqual({
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should return correct asset for Base Sepolia", () => {
      const asset = getDefaultAsset("eip155:84532");
      expect(asset).toEqual({
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name: "USDC",
        version: "2",
        decimals: 6,
      });
    });

    it("should return asset with permit2 configuration for MegaETH", () => {
      const asset = getDefaultAsset("eip155:4326");
      expect(asset.assetTransferMethod).toBe("permit2");
      expect(asset.supportsEip2612).toBe(true);
      expect(asset.decimals).toBe(18);
    });

    it("should return correct asset for newly added Arbitrum One", () => {
      const asset = getDefaultAsset("eip155:42161");
      expect(asset).toEqual({
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should return correct asset for newly added Arbitrum Sepolia", () => {
      const asset = getDefaultAsset("eip155:421614");
      expect(asset).toEqual({
        address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      });
    });

    it("should return correct asset for Stable mainnet", () => {
      const asset = getDefaultAsset("eip155:988");
      expect(asset.name).toBe("USDT0");
      expect(asset.version).toBe("1");
      expect(asset.decimals).toBe(6);
    });

    it("should return correct asset for Stable testnet", () => {
      const asset = getDefaultAsset("eip155:2201");
      expect(asset.name).toBe("USDT0");
      expect(asset.version).toBe("1");
      expect(asset.decimals).toBe(6);
    });

    it("should throw error for unsupported network", () => {
      expect(() => getDefaultAsset("eip155:99999")).toThrow(
        "No default asset configured for network eip155:99999",
      );
    });

    it("should throw error for invalid network format", () => {
      expect(() => getDefaultAsset("invalid-network")).toThrow(
        "No default asset configured for network invalid-network",
      );
    });

    it("should throw error for legacy network names", () => {
      expect(() => getDefaultAsset("base")).toThrow("No default asset configured for network base");
    });

    it("should throw error for empty network", () => {
      expect(() => getDefaultAsset("")).toThrow("No default asset configured for network ");
    });

    it("should return objects that satisfy DefaultAssetInfo interface", () => {
      Object.keys(DEFAULT_STABLECOINS).forEach(network => {
        const asset = getDefaultAsset(network);

        // Check DefaultAssetInfo properties
        expect(typeof asset.address).toBe("string");
        expect(typeof asset.name).toBe("string");
        expect(typeof asset.version).toBe("string");
        expect(typeof asset.decimals).toBe("number");
      });
    });

    it("should return objects that satisfy ExactDefaultAssetInfo interface", () => {
      Object.keys(DEFAULT_STABLECOINS).forEach(network => {
        const asset = getDefaultAsset(network);

        // Check optional ExactDefaultAssetInfo properties
        if ("assetTransferMethod" in asset) {
          expect(typeof asset.assetTransferMethod).toBe("string");
        }
        if ("supportsEip2612" in asset) {
          expect(typeof asset.supportsEip2612).toBe("boolean");
        }
      });
    });
  });

  describe("type consistency", () => {
    it("should have consistent types across all assets", () => {
      Object.entries(DEFAULT_STABLECOINS).forEach(([_network, asset]) => {
        // Verify the asset conforms to ExactDefaultAssetInfo type
        expect(asset).toHaveProperty("address");
        expect(asset).toHaveProperty("name");
        expect(asset).toHaveProperty("version");
        expect(asset).toHaveProperty("decimals");

        // TypeScript should catch any type mismatches at compile time
        const typedAsset: ExactDefaultAssetInfo = asset;
        expect(typedAsset).toBeDefined();
      });
    });

    it("should maintain consistency between constant and function", () => {
      Object.keys(DEFAULT_STABLECOINS).forEach(network => {
        const directAccess = DEFAULT_STABLECOINS[network];
        const functionAccess = getDefaultAsset(network);

        expect(directAccess).toEqual(functionAccess);
      });
    });
  });

  describe("network coverage validation", () => {
    it("should cover major EVM networks", () => {
      const supportedNetworks = Object.keys(DEFAULT_STABLECOINS);

      // Verify major networks are covered
      expect(supportedNetworks).toContain("eip155:8453"); // Base
      expect(supportedNetworks).toContain("eip155:137"); // Polygon
      expect(supportedNetworks).toContain("eip155:42161"); // Arbitrum

      // Verify testnets are covered
      expect(supportedNetworks).toContain("eip155:84532"); // Base Sepolia
      expect(supportedNetworks).toContain("eip155:421614"); // Arbitrum Sepolia
    });

    it("should have unique addresses for each network", () => {
      const addresses = Object.values(DEFAULT_STABLECOINS).map(asset =>
        asset.address.toLowerCase(),
      );
      const uniqueAddresses = new Set(addresses);

      expect(uniqueAddresses.size).toBe(addresses.length);
    });

    it("should use standard USDC configuration for most networks", () => {
      const standardUsdcNetworks = [
        "eip155:8453", // Base mainnet
        "eip155:84532", // Base Sepolia
        "eip155:137", // Polygon mainnet
        "eip155:42161", // Arbitrum One
        "eip155:421614", // Arbitrum Sepolia
        "eip155:143", // Monad mainnet
      ];

      standardUsdcNetworks.forEach(network => {
        const asset = getDefaultAsset(network);
        expect(asset.decimals).toBe(6);
        expect(asset.version).toBe("2");
        expect(asset.name).toMatch(/USD.*Coin|USDC/);
      });
    });
  });
});
