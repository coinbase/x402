import { describe, expect, it } from "vitest";
import {
  computeRoutePatterns,
  findMatchingRoute,
  getDefaultAsset,
  processPriceToAtomicAmount,
} from "x402/shared";
import { RoutePattern, RoutesConfig } from "./middleware";
import { Network } from "./network";

describe("computeRoutePatterns", () => {
  it("should handle simple string price routes", () => {
    const routes: RoutesConfig = {
      "/api/test": "$0.01",
      "/api/other": "$0.02",
    };

    const patterns = computeRoutePatterns(routes);

    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toEqual({
      verb: "*",
      pattern: /^\/api\/test$/i,
      config: {
        price: "$0.01",
        network: "base-sepolia",
      },
    });
    expect(patterns[1]).toEqual({
      verb: "*",
      pattern: /^\/api\/other$/i,
      config: {
        price: "$0.02",
        network: "base-sepolia",
      },
    });
  });

  it("should handle routes with HTTP verbs", () => {
    const routes: RoutesConfig = {
      "GET /api/test": "$0.01",
      "POST /api/other": "$0.02",
    };

    const patterns = computeRoutePatterns(routes);

    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toEqual({
      verb: "GET",
      pattern: /^\/api\/test$/i,
      config: {
        price: "$0.01",
        network: "base-sepolia",
      },
    });
    expect(patterns[1]).toEqual({
      verb: "POST",
      pattern: /^\/api\/other$/i,
      config: {
        price: "$0.02",
        network: "base-sepolia",
      },
    });
  });

  it("should handle wildcard routes", () => {
    const routes: RoutesConfig = {
      "/api/*": "$0.01",
      "GET /api/users/*": "$0.02",
    };

    const patterns = computeRoutePatterns(routes);

    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toEqual({
      verb: "*",
      pattern: /^\/api\/.*?$/i,
      config: {
        price: "$0.01",
        network: "base-sepolia",
      },
    });
    expect(patterns[1]).toEqual({
      verb: "GET",
      pattern: /^\/api\/users\/.*?$/i,
      config: {
        price: "$0.02",
        network: "base-sepolia",
      },
    });
  });

  it("should handle route parameters", () => {
    const routes: RoutesConfig = {
      "/api/users/[id]": "$0.01",
      "GET /api/posts/[slug]": "$0.02",
    };

    const patterns = computeRoutePatterns(routes);

    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toEqual({
      verb: "*",
      pattern: /^\/api\/users\/[^\/]+$/i,
      config: {
        price: "$0.01",
        network: "base-sepolia",
      },
    });
    expect(patterns[1]).toEqual({
      verb: "GET",
      pattern: /^\/api\/posts\/[^\/]+$/i,
      config: {
        price: "$0.02",
        network: "base-sepolia",
      },
    });
  });

  it("should handle full route config objects", () => {
    const routes: RoutesConfig = {
      "/api/test": {
        price: "$0.01",
        network: "base-sepolia",
        config: {
          description: "Test route",
          mimeType: "application/json",
        },
      },
    };

    const patterns = computeRoutePatterns(routes);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toEqual({
      verb: "*",
      pattern: /^\/api\/test$/i,
      config: {
        price: "$0.01",
        network: "base-sepolia",
        config: {
          description: "Test route",
          mimeType: "application/json",
        },
      },
    });
  });

  it("should throw error for invalid route patterns", () => {
    const routes: RoutesConfig = {
      "GET ": "$0.01", // Invalid pattern with no path
    };

    expect(() => computeRoutePatterns(routes)).toThrow("Invalid route pattern: GET ");
  });
});

describe("findMatchingRoute", () => {
  const routePatterns: RoutePattern[] = [
    {
      verb: "GET",
      pattern: /^\/api\/test$/i,
      config: {
        price: "$0.01",
        network: "base-sepolia",
      },
    },
    {
      verb: "POST",
      pattern: /^\/api\/test$/i,
      config: {
        price: "$0.02",
        network: "base-sepolia",
      },
    },
    {
      verb: "*",
      pattern: /^\/api\/wildcard$/i,
      config: {
        price: "$0.03",
        network: "base-sepolia",
      },
    },
  ];

  it("should return undefined when no routes match", () => {
    const result = findMatchingRoute(routePatterns, "/not/api", "GET");
    expect(result).toBeUndefined();
  });

  it("should match routes with wildcard verbs", () => {
    const result = findMatchingRoute(routePatterns, "/api/wildcard", "PUT");
    expect(result).toEqual(routePatterns[2]);
  });

  it("should match routes with specific verbs", () => {
    const result = findMatchingRoute(routePatterns, "/api/test", "POST");
    expect(result).toEqual(routePatterns[1]);
  });

  it("should not match routes with wrong verbs", () => {
    const result = findMatchingRoute(routePatterns, "/api/test", "PUT");
    expect(result).toBeUndefined();
  });

  it("should handle case-insensitive method matching", () => {
    const result = findMatchingRoute(routePatterns, "/api/test", "post");
    expect(result).toEqual(routePatterns[1]);
  });

  it("should handle case-insensitive path matching", () => {
    const result = findMatchingRoute(routePatterns, "/API/test", "GET");
    expect(result).toEqual(routePatterns[0]);
  });

  it("should handle empty route patterns array", () => {
    const result = findMatchingRoute([], "/api/test", "GET");
    expect(result).toBeUndefined();
  });

  it("should fail to match when path has extra slashes", () => {
    const result = findMatchingRoute(routePatterns, "//api/test", "GET");
    expect(result).toBeUndefined();
  });

  it("should fail to match when path has trailing slash", () => {
    const result = findMatchingRoute(routePatterns, "/api/test/", "GET");
    expect(result).toBeUndefined();
  });
});

describe("getDefaultAsset", () => {
  it("should return Base USDC asset details", () => {
    const result = getDefaultAsset("base");

    expect(result).toEqual({
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      eip712: {
        name: "USD Coin",
        version: "2",
      },
    });
  });

  it("should return Base Sepolia USDC asset details", () => {
    const result = getDefaultAsset("base-sepolia");

    expect(result).toEqual({
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      eip712: {
        name: "USDC",
        version: "2",
      },
    });
  });

  it("should return Ethereum Mainnet USDC asset details", () => {
    const result = getDefaultAsset("mainnet");
    expect(result).toEqual({
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      eip712: {
        name: "USD Coin",
        version: "2",
      },
    });
  });

  it("should handle unknown networks", () => {
    expect(() => getDefaultAsset("unknown" as Network)).toThrow("Unsupported network: unknown");
  });
});

describe("processPriceToAtomicAmount", () => {
  it("should handle string price in dollars", () => {
    const result = processPriceToAtomicAmount("$0.01", "base-sepolia");
    expect(result).toEqual({
      maxAmountRequired: "10000",
      asset: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
        eip712: {
          name: "USDC",
          version: "2",
        },
      },
    });
  });

  it("should handle number price in dollars", () => {
    const result = processPriceToAtomicAmount(0.01, "base-sepolia");
    expect(result).toEqual({
      maxAmountRequired: "10000",
      asset: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
        eip712: {
          name: "USDC",
          version: "2",
        },
      },
    });
  });

  it("should handle string price in dollars for mainnet", () => {
    const result = processPriceToAtomicAmount("$0.01", "mainnet");
    expect(result).toEqual({
      maxAmountRequired: "10000",
      asset: {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
        eip712: {
          name: "USD Coin",
          version: "2",
        },
      },
    });
  });

  it("should handle token amount object", () => {
    const tokenAmount = {
      amount: "1000000",
      asset: {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        decimals: 18,
        eip712: {
          name: "Custom Token",
          version: "1",
        },
      },
    };
    const result = processPriceToAtomicAmount(tokenAmount, "base-sepolia");
    expect(result).toEqual({
      maxAmountRequired: "1000000",
      asset: tokenAmount.asset,
    });
  });

  it("should handle invalid price format", () => {
    const result = processPriceToAtomicAmount("invalid", "base-sepolia");
    expect(result).toEqual({
      error: expect.stringContaining("Invalid price"),
    });
  });

  it("should handle negative price", () => {
    const result = processPriceToAtomicAmount("-$0.01", "base-sepolia");
    expect(result).toEqual({
      error: expect.stringContaining("Invalid price"),
    });
  });

  it("should handle zero price", () => {
    const result = processPriceToAtomicAmount("$0", "base-sepolia");
    expect(result).toEqual({
      error: expect.stringContaining("Number must be greater than or equal to 0.0001"),
    });
  });
});
