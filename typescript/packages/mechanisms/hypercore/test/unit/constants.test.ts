import { describe, it, expect } from "vitest";
import {
  HYPERLIQUID_API_URLS,
  HYPERCORE_NETWORKS,
  HYPERCORE_EIP712_DOMAIN,
  HYPERCORE_EIP712_TYPES,
  HYPERCORE_NETWORK_CONFIGS,
  MAX_NONCE_AGE_MS,
  TX_HASH_LOOKUP,
} from "../../src/constants.js";

describe("constants", () => {
  it("should have valid API URLs", () => {
    expect(HYPERLIQUID_API_URLS.mainnet).toBe("https://api.hyperliquid.xyz");
    expect(HYPERLIQUID_API_URLS.testnet).toBe("https://api.hyperliquid-testnet.xyz");
  });

  it("should have valid CAIP-2 network identifiers", () => {
    expect(HYPERCORE_NETWORKS.mainnet).toBe("hypercore:mainnet");
    expect(HYPERCORE_NETWORKS.testnet).toBe("hypercore:testnet");
  });

  it("should have correct EIP-712 domain", () => {
    expect(HYPERCORE_EIP712_DOMAIN.name).toBe("HyperliquidSignTransaction");
    expect(HYPERCORE_EIP712_DOMAIN.version).toBe("1");
    expect(HYPERCORE_EIP712_DOMAIN.chainId).toBe(999n);
    expect(HYPERCORE_EIP712_DOMAIN.verifyingContract).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("should have correct EIP-712 types", () => {
    expect(HYPERCORE_EIP712_TYPES["HyperliquidTransaction:SendAsset"]).toBeDefined();
    expect(HYPERCORE_EIP712_TYPES["HyperliquidTransaction:SendAsset"].length).toBe(8);
  });

  it("should have network configs with default assets", () => {
    const mainnetConfig = HYPERCORE_NETWORK_CONFIGS["hypercore:mainnet"];
    expect(mainnetConfig).toBeDefined();
    expect(mainnetConfig.defaultAsset.token).toMatch(/^USDH:0x[a-fA-F0-9]{32}$/);
    expect(mainnetConfig.defaultAsset.name).toBe("USDH");
    expect(mainnetConfig.defaultAsset.decimals).toBe(8);

    const testnetConfig = HYPERCORE_NETWORK_CONFIGS["hypercore:testnet"];
    expect(testnetConfig).toBeDefined();
    expect(testnetConfig.defaultAsset.token).toMatch(/^USDH:0x[a-fA-F0-9]{32}$/);
    expect(testnetConfig.defaultAsset.decimals).toBe(8);
  });

  it("should have reasonable nonce age", () => {
    expect(MAX_NONCE_AGE_MS).toBe(3600000);
  });

  it("should have transaction hash lookup config", () => {
    expect(TX_HASH_LOOKUP.maxRetries).toBeGreaterThan(0);
    expect(TX_HASH_LOOKUP.retryDelay).toBeGreaterThan(0);
    expect(TX_HASH_LOOKUP.lookbackWindow).toBeGreaterThan(0);
  });
});
