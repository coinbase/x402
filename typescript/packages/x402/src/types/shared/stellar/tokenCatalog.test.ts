import { describe, expect, it } from "vitest";
import { isStellarToken, StellarToken, StellarTokenCatalogPerChain } from "./tokenCatalog";

describe("isStellarToken", () => {
  it("should return true for a valid testnet Stellar token", () => {
    const validToken: StellarToken = {
      network: "stellar-testnet",
      name: "USD Coin",
      symbol: "USDC",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
    };

    expect(isStellarToken(validToken)).toBe(true);
  });

  it("should return true for a valid mainnet Stellar token", () => {
    const validToken: StellarToken = {
      network: "stellar",
      name: "USD Coin",
      symbol: "USDC",
      address: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      decimals: 7,
    };

    expect(isStellarToken(validToken)).toBe(true);
  });

  it("should return false for null", () => {
    expect(isStellarToken(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isStellarToken(undefined)).toBe(false);
  });

  it("should return false for an empty object", () => {
    expect(isStellarToken({})).toBe(false);
  });

  it("should return false for an object missing the network property", () => {
    const invalidToken = {
      name: "USD Coin",
      symbol: "USDC",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
    };

    expect(isStellarToken(invalidToken)).toBe(false);
  });

  it("should return false for an object missing the name property", () => {
    const invalidToken = {
      network: "stellar-testnet",
      symbol: "USDC",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
    };

    expect(isStellarToken(invalidToken)).toBe(false);
  });

  it("should return false for an object missing the symbol property", () => {
    const invalidToken = {
      network: "stellar-testnet",
      name: "USD Coin",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
    };

    expect(isStellarToken(invalidToken)).toBe(false);
  });

  it("should return false for an object missing the address property", () => {
    const invalidToken = {
      network: "stellar-testnet",
      name: "USD Coin",
      symbol: "USDC",
      decimals: 7,
    };

    expect(isStellarToken(invalidToken)).toBe(false);
  });

  it("should return false for an object with an invalid address", () => {
    const invalidToken = {
      network: "stellar-testnet",
      name: "USD Coin",
      symbol: "USDC",
      address: "invalid-address",
      decimals: 7,
    };
    expect(isStellarToken(invalidToken)).toBe(false);
  });

  it("should return false for an object missing the decimals property", () => {
    const invalidToken = {
      network: "stellar-testnet",
      name: "USD Coin",
      symbol: "USDC",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    };

    expect(isStellarToken(invalidToken)).toBe(false);
  });

  it("should return false for an object with an invalid network", () => {
    const tokenWithExtraProps = {
      network: "invalid-network",
      name: "USD Coin",
      symbol: "USDC",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
    };
    expect(isStellarToken(tokenWithExtraProps)).toBe(false);
  });

  it("should return true for an object with all required properties and extra properties", () => {
    const tokenWithExtraProps = {
      network: "stellar-testnet",
      name: "USD Coin",
      symbol: "USDC",
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      decimals: 7,
      extraProperty: "extra value",
    };

    expect(isStellarToken(tokenWithExtraProps)).toBe(true);
  });
});

describe("StellarTokenCatalogPerChain", () => {
  it("should have a catalogs only for stellar & stellar-testnet networks", () => {
    expect(Object.keys(StellarTokenCatalogPerChain)).toHaveLength(2);
    expect(StellarTokenCatalogPerChain["stellar-testnet"]).toBeDefined();
    expect(StellarTokenCatalogPerChain["stellar"]).toBeDefined();
  });

  it("should have USDC in stellar-testnet catalog", () => {
    const testnetCatalog = StellarTokenCatalogPerChain["stellar-testnet"];
    expect(testnetCatalog?.USDC).toBeDefined();
    expect(testnetCatalog?.USDC.symbol).toBe("USDC");
    expect(testnetCatalog?.USDC.name).toBe("USD Coin");
    expect(testnetCatalog?.USDC.network).toBe("stellar-testnet");
    expect(testnetCatalog?.USDC.decimals).toBe(7);
    expect(testnetCatalog?.USDC.address).toBe(
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    );
  });

  it("should have USDC in stellar mainnet catalog", () => {
    const mainnetCatalog = StellarTokenCatalogPerChain["stellar"];
    expect(mainnetCatalog?.USDC).toBeDefined();
    expect(mainnetCatalog?.USDC.symbol).toBe("USDC");
    expect(mainnetCatalog?.USDC.name).toBe("USD Coin");
    expect(mainnetCatalog?.USDC.network).toBe("stellar");
    expect(mainnetCatalog?.USDC.decimals).toBe(7);
    expect(mainnetCatalog?.USDC.address).toBe(
      "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    );
  });

  it("should only have VALID Stellar tokens in all catalogs", () => {
    const testnetCatalog = StellarTokenCatalogPerChain["stellar-testnet"];
    Object.values(testnetCatalog ?? {}).forEach(token => {
      expect(isStellarToken(token)).toBe(true);
    });

    const mainnetCatalog = StellarTokenCatalogPerChain["stellar"];
    Object.values(mainnetCatalog ?? {}).forEach(token => {
      expect(isStellarToken(token)).toBe(true);
    });
  });
});
