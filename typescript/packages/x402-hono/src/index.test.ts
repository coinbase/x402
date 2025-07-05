import type { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exact } from "x402/schemes";
import { findMatchingRoute, getPaywallHtml } from "x402/shared";
import {
  FacilitatorConfig,
  PaymentMiddlewareConfig,
  PaymentPayload,
  RoutesConfig,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { paymentMiddleware } from "./index";

// Mock dependencies
vi.mock("x402/verify", () => ({
  useFacilitator: vi.fn(),
}));

vi.mock("x402/shared", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPaywallHtml: vi.fn(),
    getNetworkId: vi.fn().mockReturnValue("base-sepolia"),
    toJsonSafe: vi.fn(x => x),
    findMatchingRoute: vi
      .fn()
      .mockImplementation(
        (routePatterns: Array<{ pattern: RegExp; verb: string }>, path: string, method: string) => {
          if (!routePatterns) return undefined;
          return routePatterns.find(({ pattern, verb }) => {
            const matchesPath = pattern.test(path);
            const matchesVerb = verb === "*" || verb === method.toUpperCase();
            return matchesPath && matchesVerb;
          });
        },
      ),
  };
});

vi.mock("x402/shared/evm", () => ({
  getUsdcAddressForChain: vi.fn().mockReturnValue("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
}));

// Mock exact.evm.decodePayment
vi.mock("x402/schemes", () => ({
  exact: {
    evm: {
      encodePayment: vi.fn(),
      decodePayment: vi.fn(),
    },
  },
}));

describe("paymentMiddleware()", () => {
  let mockContext: Context;
  let mockNext: () => Promise<void>;
  let middleware: ReturnType<typeof paymentMiddleware>;
  let mockVerify: ReturnType<typeof useFacilitator>["verify"];
  let mockSettle: ReturnType<typeof useFacilitator>["settle"];

  const middlewareConfig: PaymentMiddlewareConfig = {
    description: "Test payment",
    mimeType: "application/json",
    maxTimeoutSeconds: 300,
    outputSchema: { type: "object" },
    resource: "https://api.example.com/resource",
  };

  const facilitatorConfig: FacilitatorConfig = {
    url: "https://facilitator.example.com",
  };

  const payTo = "0x1234567890123456789012345678901234567890";

  const routesConfig: RoutesConfig = {
    "/weather": {
      price: "$0.001",
      network: "base-sepolia",
      config: middlewareConfig,
    },
  };

  const validPayment: PaymentPayload = {
    scheme: "exact",
    x402Version: 1,
    network: "base-sepolia",
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
  };
  const encodedValidPayment = "encoded-payment";

  beforeEach(() => {
    vi.resetAllMocks();

    mockContext = {
      req: {
        url: "http://localhost:3000/weather",
        path: "/weather",
        method: "GET",
        header: vi.fn(),
        headers: new Headers(),
      },
      res: {
        status: 200,
        headers: new Headers(),
      },
      header: vi.fn(),
      json: vi.fn(),
      html: vi.fn(),
    } as unknown as Context;

    mockNext = vi.fn();
    mockVerify = vi.fn() as ReturnType<typeof useFacilitator>["verify"];
    mockSettle = vi.fn().mockImplementation(() => {
      return {
        success: true,
      };
    }) as ReturnType<typeof useFacilitator>["settle"];
    (useFacilitator as ReturnType<typeof vi.fn>).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
    });
    (getPaywallHtml as ReturnType<typeof vi.fn>).mockReturnValue("<html>Paywall</html>");

    // Setup exact.evm mocks
    (exact.evm.encodePayment as ReturnType<typeof vi.fn>).mockReturnValue(encodedValidPayment);
    (exact.evm.decodePayment as ReturnType<typeof vi.fn>).mockReturnValue(validPayment);

    // Setup findMatchingRoute mock
    (findMatchingRoute as ReturnType<typeof vi.fn>).mockImplementation(
      (routePatterns, path, method) => {
        if (path === "/weather" && method === "GET") {
          return routePatterns[0];
        }
        return undefined;
      },
    );

    middleware = paymentMiddleware(
      payTo,
      routesConfig,
      facilitatorConfig,
      undefined,
      useFacilitator,
    );
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name.toUpperCase() === "ACCEPT") return "application/json";
      return undefined;
    });

    await middleware(mockContext, mockNext);

    const res = mockContext.res;
    expect(res.status).toEqual(402);
    await expect(res.json()).resolves.toEqual({
      error: "X-PAYMENT header is required",
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: "1000",
          resource: "https://api.example.com/resource",
          description: "Test payment",
          mimeType: "application/json",
          payTo: "0x1234567890123456789012345678901234567890",
          maxTimeoutSeconds: 300,
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          outputSchema: { type: "object" },
          extra: {
            name: "USDC",
            version: "2",
          },
        },
      ],
      x402Version: 1,
    });
  });

  it("should return HTML paywall for browser requests", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "Accept") return "text/html";
      if (name === "User-Agent") return "Mozilla/5.0";
      return undefined;
    });

    await middleware(mockContext, mockNext);

    expect(mockContext.html).toHaveBeenCalledWith("<html>Paywall</html>", 402);
  });

  it("should verify payment and proceed if valid", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name.toUpperCase() === "X-PAYMENT") return encodedValidPayment;
      return undefined;
    });

    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });

    await middleware(mockContext, mockNext);

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockVerify).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockNext).toHaveBeenCalled();
  });

  it("should return 402 if payment verification fails", async () => {
    const invalidPayment = "invalid-payment-header";
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name.toUpperCase() === "X-PAYMENT") return invalidPayment;
      return undefined;
    });

    (exact.evm.decodePayment as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Invalid payment");
    });

    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      invalidReason: "insufficient_funds",
    });

    await middleware(mockContext, mockNext);
    const res = mockContext.res;
    expect(res.status).toEqual(402);
    await expect(res.json()).resolves.toEqual({
      x402Version: 1,
      error: "Invalid payment",
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: "1000",
          resource: "https://api.example.com/resource",
          description: "Test payment",
          mimeType: "application/json",
          payTo: "0x1234567890123456789012345678901234567890",
          maxTimeoutSeconds: 300,
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          outputSchema: { type: "object" },
          extra: {
            name: "USDC",
            version: "2",
          },
        },
      ],
    });
  });

  it("should handle settlement after response", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name.toUpperCase() === "X-PAYMENT") return encodedValidPayment;
      return undefined;
    });

    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      transaction: "0x123",
      network: "base-sepolia",
    });

    // Mock the json method to simulate response already sent
    const originalJson = mockContext.json;
    mockContext.json = vi.fn().mockImplementation(() => {
      throw new Error("Response already sent");
    });

    // Spy on the Headers.set method
    const headersSpy = vi.spyOn(mockContext.res.headers, "set");

    await middleware(mockContext, mockNext);

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockSettle).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(headersSpy).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", expect.any(String));

    // Restore original json method
    mockContext.json = originalJson;
    // Restore the spy
    headersSpy.mockRestore();
  });

  it("should handle settlement failure before response is sent", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name.toUpperCase() === "X-PAYMENT") return encodedValidPayment;
      return undefined;
    });

    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));

    await middleware(mockContext, mockNext);
    const res = mockContext.res;
    expect(res.status).toEqual(402);
    await expect(res.json()).resolves.toEqual({
      x402Version: 1,
      error: "Settlement failed",
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: "1000",
          resource: "https://api.example.com/resource",
          description: "Test payment",
          mimeType: "application/json",
          payTo: "0x1234567890123456789012345678901234567890",
          maxTimeoutSeconds: 300,
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          outputSchema: { type: "object" },
          extra: {
            name: "USDC",
            version: "2",
          },
        },
      ],
    });
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name.toUpperCase() === "X-PAYMENT") return encodedValidPayment;
      return undefined;
    });
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      transaction: "0x123",
      network: "base-sepolia",
    });

    // Simulate downstream handler setting status 500
    Object.defineProperty(mockContext.res, "status", { value: 500, writable: true });

    await middleware(mockContext, mockNext);

    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockContext.res.status).toBe(500);
  });

  describe("session token integration", () => {
    it("should pass sessionTokenEndpoint to paywall HTML when configured", async () => {
      const paywallConfig = {
        cdpClientKey: "test-client-key",
        appName: "Test App",
        appLogo: "/test-logo.png",
        sessionTokenEndpoint: "/api/x402/session-token",
      };

      const middlewareWithPaywall = paymentMiddleware(
        payTo,
        routesConfig,
        facilitatorConfig,
        paywallConfig,
      );

      (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
        if (name === "Accept") return "text/html";
        if (name === "User-Agent") return "Mozilla/5.0";
        return undefined;
      });

      await middlewareWithPaywall(mockContext, mockNext);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          cdpClientKey: "test-client-key",
          appName: "Test App",
          appLogo: "/test-logo.png",
          sessionTokenEndpoint: "/api/x402/session-token",
        }),
      );
    });

    it("should not pass sessionTokenEndpoint when not configured", async () => {
      const paywallConfig = {
        cdpClientKey: "test-client-key",
        appName: "Test App",
      };

      const middlewareWithPaywall = paymentMiddleware(
        payTo,
        routesConfig,
        facilitatorConfig,
        paywallConfig,
      );

      (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
        if (name === "Accept") return "text/html";
        if (name === "User-Agent") return "Mozilla/5.0";
        return undefined;
      });

      await middlewareWithPaywall(mockContext, mockNext);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          cdpClientKey: "test-client-key",
          appName: "Test App",
          sessionTokenEndpoint: undefined,
        }),
      );
    });

    it("should pass sessionTokenEndpoint even when other paywall config is minimal", async () => {
      const paywallConfig = {
        sessionTokenEndpoint: "/custom/session-token",
      };

      const middlewareWithPaywall = paymentMiddleware(
        payTo,
        routesConfig,
        facilitatorConfig,
        paywallConfig,
      );

      (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
        if (name === "Accept") return "text/html";
        if (name === "User-Agent") return "Mozilla/5.0";
        return undefined;
      });

      await middlewareWithPaywall(mockContext, mockNext);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTokenEndpoint: "/custom/session-token",
          cdpClientKey: undefined,
          appName: undefined,
          appLogo: undefined,
        }),
      );
    });

    it("should work without any paywall config", async () => {
      const middlewareWithoutPaywall = paymentMiddleware(payTo, routesConfig, facilitatorConfig);

      (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
        if (name === "Accept") return "text/html";
        if (name === "User-Agent") return "Mozilla/5.0";
        return undefined;
      });

      await middlewareWithoutPaywall(mockContext, mockNext);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTokenEndpoint: undefined,
          cdpClientKey: undefined,
          appName: undefined,
          appLogo: undefined,
        }),
      );
    });
  });
});
