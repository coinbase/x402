import { describe, expect, it } from "vitest";
import {
  computeRoutePatterns,
  findMatchingRoute,
  getDefaultAsset,
  processPriceToAtomicAmount,
} from "x402/shared";
import { Network, RoutePattern, RoutesConfig } from "../types";

// Mock dependencies for ExactEvmMiddleware tests
import { vi, beforeEach } from "vitest";
import { ExactEvmMiddleware } from "./middleware";
import { useFacilitator } from "../verify";
import { getPaywallHtml } from "./paywall";
import { toJsonSafe } from "./json";
import { Address } from "viem";

// Mock the dependencies
vi.mock("../verify", () => ({
  useFacilitator: vi.fn(),
}));

vi.mock("./paywall", () => ({
  getPaywallHtml: vi.fn(),
}));

vi.mock("./json", () => ({
  toJsonSafe: vi.fn(),
}));

vi.mock("../schemes", () => ({
  exact: {
    evm: {
      decodePayment: vi.fn(),
    },
  },
}));

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

// --- ExactEvmMiddleware class tests ---
describe("ExactEvmMiddleware", () => {
  const payTo = "0x1234567890123456789012345678901234567890" as Address;
  const routes = {
    "/protected": {
      price: "$0.01",
      network: "base-sepolia" as const,
      config: { description: "desc" },
    },
  };
  let mockVerify: ReturnType<typeof vi.fn>;
  let mockSettle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockVerify = vi.fn();
    mockSettle = vi.fn();
    vi.mocked(useFacilitator).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
    });
    vi.mocked(getPaywallHtml).mockReturnValue("<html>Paywall</html>");
    vi.mocked(toJsonSafe).mockImplementation(x => x);
  });

  it("processRequest returns requiresPayment=false for unmatched route", async () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    const result = await mw.processRequest("/not-protected", "GET");
    expect(result).toEqual({ requiresPayment: false });
  });

  it("processRequest returns payment requirements for matched route", async () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    const result = await mw.processRequest("/protected", "GET", "https://example.com/protected");
    expect(result).toMatchObject({
      requiresPayment: true,
      paymentRequirements: expect.any(Array),
      displayAmount: 0.01,
      network: "base-sepolia",
    });
    if (result.requiresPayment) {
      expect(result.paymentRequirements[0]).toMatchObject({
        scheme: "exact",
        network: "base-sepolia",
        payTo,
        description: "desc",
      });
    }
  });

  it("generatePaywallHtml returns custom HTML if provided", () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    const html = mw.generatePaywallHtml([], 0.01, "url", "base-sepolia", "<custom>html</custom>");
    expect(html).toBe("<custom>html</custom>");
  });

  it("generatePaywallHtml calls getPaywallHtml if no custom HTML", () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    const html = mw.generatePaywallHtml([], 0.01, "url", "base-sepolia");
    expect(getPaywallHtml).toHaveBeenCalled();
    expect(html).toBe("<html>Paywall</html>");
  });

  it("isWebBrowser detects browser headers", () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    expect(
      mw.isWebBrowser({
        "user-agent": "Mozilla/5.0",
        accept: "text/html,application/xhtml+xml",
      }),
    ).toBe(true);
    expect(
      mw.isWebBrowser({
        "user-agent": "curl/7.0",
        accept: "application/json",
      }),
    ).toBe(false);
  });

  it("createErrorResponse returns correct error object", () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    const err = mw.createErrorResponse("fail", [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "r",
        description: "",
        mimeType: "application/json",
        payTo,
        maxTimeoutSeconds: 300,
        asset: "0xabc",
        extra: { name: "USDC", version: "2" },
      },
    ]);
    expect(err).toMatchObject({ x402Version: 1, error: "fail", accepts: expect.any(Array) });
  });

  it("verifyPayment returns error for invalid payment header", async () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    // Patch decodePayment to throw
    const { exact } = await import("../schemes");
    vi.mocked(exact.evm.decodePayment).mockImplementation(() => {
      throw new Error("bad header");
    });
    const result = await mw.verifyPayment("bad", []);
    expect(result).toMatchObject({ success: false, error: "bad header" });
  });

  it("verifyPayment returns error if no matching requirements", async () => {
    const mw = new ExactEvmMiddleware(payTo, routes);
    // Patch decodePayment to return a valid object
    const { exact } = await import("../schemes");
    vi.mocked(exact.evm.decodePayment).mockReturnValue({
      scheme: "exact" as const,
      network: "base" as const,
      x402Version: 1,
      payload: {
        signature: "0x123",
        authorization: {
          from: "0x123",
          to: "0x456",
          value: "0x123",
          validAfter: "0x123",
          validBefore: "0x123",
          nonce: "0x123",
        },
      },
    });
    const result = await mw.verifyPayment("header", []);
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Unable to find matching payment requirements"),
    });
  });

  const fullPaymentReq = {
    scheme: "exact" as const,
    network: "base-sepolia" as const,
    maxAmountRequired: "1000",
    resource: "r",
    description: "desc",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 300,
    asset: "0xabc",
    extra: { name: "USDC", version: "2" },
  };

  it("verifyPayment returns error if verify throws", async () => {
    mockVerify.mockRejectedValue(new Error("verify failed"));
    const mw = new ExactEvmMiddleware(payTo, routes);
    // Patch decodePayment to return a valid object
    const { exact } = await import("../schemes");
    vi.mocked(exact.evm.decodePayment).mockReturnValue({
      scheme: "exact" as const,
      network: "base-sepolia" as const,
      x402Version: 1,
      payload: {
        signature: "0x123",
        authorization: {
          from: "0x123",
          to: "0x456",
          value: "0x123",
          validAfter: "0x123",
          validBefore: "0x123",
          nonce: "0x123",
        },
      },
    });
    const result = await mw.verifyPayment("header", [fullPaymentReq]);
    expect(result).toMatchObject({ success: false, error: "verify failed" });
  });

  it("verifyPayment returns success if verify passes", async () => {
    mockVerify.mockResolvedValue({ isValid: true });
    const mw = new ExactEvmMiddleware(payTo, routes);
    // Patch decodePayment to return a valid object
    const { exact } = await import("../schemes");
    vi.mocked(exact.evm.decodePayment).mockReturnValue({
      scheme: "exact" as const,
      network: "base-sepolia" as const,
      x402Version: 1,
      payload: {
        signature: "0x123",
        authorization: {
          from: "0x123",
          to: "0x456",
          value: "0x123",
          validAfter: "0x123",
          validBefore: "0x123",
          nonce: "0x123",
        },
      },
    });
    const result = await mw.verifyPayment("header", [fullPaymentReq]);
    expect(result).toMatchObject({ success: true });
  });

  it("settlePayment returns success if settle passes", async () => {
    mockSettle.mockResolvedValue({ tx: "0xabc" });
    const mw = new ExactEvmMiddleware(payTo, routes);
    const result = await mw.settlePayment(
      {
        scheme: "exact" as const,
        network: "base-sepolia" as const,
        x402Version: 1,
        payload: {
          signature: "0x123",
          authorization: {
            from: "0x123",
            to: "0x456",
            value: "0x123",
            validAfter: "0x123",
            validBefore: "0x123",
            nonce: "0x123",
          },
        },
      },
      fullPaymentReq,
    );
    expect(result.success).toBe(true);
    expect(result.responseHeader).toBeDefined();
  });

  it("settlePayment returns error if settle throws", async () => {
    mockSettle.mockRejectedValue(new Error("settle failed"));
    const mw = new ExactEvmMiddleware(payTo, routes);
    const result = await mw.settlePayment(
      {
        scheme: "exact" as const,
        network: "base-sepolia" as const,
        x402Version: 1,
        payload: {
          signature: "0x123",
          authorization: {
            from: "0x123",
            to: "0x456",
            value: "0x123",
            validAfter: "0x123",
            validBefore: "0x123",
            nonce: "0x123",
          },
        },
      },
      fullPaymentReq,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("settle failed");
  });
});
