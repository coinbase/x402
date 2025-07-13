import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type {
  PaymentMiddlewareConfig,
  PaymentPayload,
  RoutesConfig,
  FacilitatorConfig,
  RouteConfig,
} from "x402/types";
import { findMatchingRoute, safeBase64Encode } from "x402/shared";
import { useFacilitator } from "x402/verify";
import { paymentMiddleware } from "./index";
import { renderPaywallHtml } from "x402/middleware";

// Mock dependencies
vi.mock("x402/verify", () => ({
  useFacilitator: vi.fn().mockReturnValue({
    verify: vi.fn(),
    settle: vi.fn(),
  }),
}));

vi.mock("x402/middleware", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    renderPaywallHtml: vi.fn(),
  };
});

vi.mock("x402/shared", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    findMatchingRoute: vi
      .fn()
      .mockImplementation(
        (
          routePatterns: Array<{ pattern: RegExp; verb: string; config: RouteConfig }>,
          path: string,
          method: string,
        ) => {
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

describe("paymentMiddleware()", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
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
    "/test": {
      price: "$0.001",
      network: "base-sepolia",
      config: middlewareConfig,
    },
  };

  const VALID_PAYMENT: PaymentPayload = {
    scheme: "exact",
    x402Version: 1,
    network: "base-sepolia",
    payload: {
      signature: "0x123",
      authorization: {
        from: "0xbac675c310721717cd4a37f6cbea1f081b1c2a07",
        to: "0xbac675c310721717cd4a37f6cbea1f081b1c2a07",
        value: "1000",
        validAfter: "0x123",
        validBefore: "0x123",
        nonce: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
  };
  const VALID_PAYMENT_B64 = safeBase64Encode(JSON.stringify(VALID_PAYMENT));

  beforeEach(() => {
    vi.resetAllMocks();
    mockReq = {
      path: "/test",
      method: "GET",
      headers: {
        host: "api.example.com",
      },
      protocol: "https",
      header: function (name: string) {
        return this.headers[name.toLowerCase()];
      },
    } as Request;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      headersSent: false,
    } as unknown as Response;
    mockNext = vi.fn().mockImplementation(() => {
      mockRes?.end?.();
    });
    mockVerify = vi.fn();
    mockSettle = vi.fn().mockImplementation(() => Promise.resolve({ success: true }));

    vi.mocked(useFacilitator).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
    });

    // Setup paywall HTML mock
    vi.mocked(renderPaywallHtml).mockReturnValue("<html>Paywall</html>");

    // Setup route pattern matching mock
    vi.mocked(findMatchingRoute).mockImplementation((routePatterns, path, method) => {
      if (path === "/test" && method === "GET") {
        return routePatterns[0];
      }
      return undefined;
    });

    middleware = paymentMiddleware(
      payTo,
      routesConfig,
      facilitatorConfig,
      undefined,
      useFacilitator,
    );
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    mockReq.headers = {};
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "X-PAYMENT header is required",
        accepts: expect.any(Array),
        x402Version: 1,
      }),
    );
  });

  it("should return HTML paywall for browser requests", async () => {
    mockReq.headers = {
      accept: "text/html",
      "user-agent": "Mozilla/5.0",
    };
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.send).toHaveBeenCalledWith("<html>Paywall</html>");
  });

  it("should verify payment and proceed if valid", async () => {
    mockReq.headers = {
      "x-payment": VALID_PAYMENT_B64,
    };
    mockRes.statusCode = 200;
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockVerify).toHaveBeenCalledWith(VALID_PAYMENT, expect.any(Object));
    expect(mockNext).toHaveBeenCalled();
  });

  it("should return 402 if payment verification fails", async () => {
    mockReq.headers = {
      ...mockReq.headers,
      "x-payment": "invalid-payment-header",
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      invalidReason: "insufficient_funds",
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "Invalid payment: Invalid character",
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
    mockReq.headers = {
      "x-payment": VALID_PAYMENT_B64,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      transaction: "0x123",
      network: "base-sepolia",
    });

    // Mock response.end to capture arguments
    const endArgs: Parameters<Response["end"]>[] = [];
    (mockRes.end as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: Parameters<Response["end"]>) => {
        endArgs.push(args);
      },
    );

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockSettle).toHaveBeenCalledWith(VALID_PAYMENT, expect.any(Object));
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", expect.any(String));
  });

  it("should handle settlement failure before response is sent", async () => {
    mockReq.headers = {
      "x-payment": VALID_PAYMENT_B64,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
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

  it("should handle settlement failure after response is sent", async () => {
    mockReq.headers = {
      "x-payment": VALID_PAYMENT_B64,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));
    mockRes.headersSent = true;

    // Mock response.end to capture arguments
    const endArgs: Parameters<Response["end"]>[] = [];
    (mockRes.end as ReturnType<typeof vi.fn>).mockImplementation(
      (...args: Parameters<Response["end"]>) => {
        endArgs.push(args);
      },
    );

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockSettle).toHaveBeenCalledWith(VALID_PAYMENT, expect.any(Object));
    // Should not try to send another response since headers are already sent
    expect(mockRes.status).not.toHaveBeenCalledWith(402);
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    mockReq.headers = {
      "x-payment": VALID_PAYMENT_B64,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      transaction: "0x123",
      network: "base-sepolia",
    });

    // Simulate downstream handler setting status 500
    (mockRes.status as ReturnType<typeof vi.fn>).mockImplementation(function (
      this: Response,
      code: number,
    ) {
      this.statusCode = code;
      return this;
    });
    mockRes.statusCode = 500;

    // call the middleware
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    // make assertions
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(500);
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

      mockReq.headers = {
        accept: "text/html",
        "user-agent": "Mozilla/5.0",
      };

      await middlewareWithPaywall(mockReq as Request, mockRes as Response, mockNext);

      expect(renderPaywallHtml).toBeCalledWith(
        expect.objectContaining({
          paywall: {
            cdpClientKey: "test-client-key",
            appName: "Test App",
            appLogo: "/test-logo.png",
            sessionTokenEndpoint: "/api/x402/session-token",
          },
        }),
        expect.any(Array),
        undefined,
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

      mockReq.headers = {
        accept: "text/html",
        "user-agent": "Mozilla/5.0",
      };

      await middlewareWithPaywall(mockReq as Request, mockRes as Response, mockNext);

      expect(renderPaywallHtml).toBeCalledWith(
        expect.objectContaining({
          paywall: {
            cdpClientKey: "test-client-key",
            appName: "Test App",
            sessionTokenEndpoint: undefined,
          },
        }),
        expect.any(Array),
        undefined,
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

      mockReq.headers = {
        accept: "text/html",
        "user-agent": "Mozilla/5.0",
      };

      await middlewareWithPaywall(mockReq as Request, mockRes as Response, mockNext);

      expect(renderPaywallHtml).toBeCalledWith(
        expect.objectContaining({
          paywall: {
            sessionTokenEndpoint: "/custom/session-token",
            cdpClientKey: undefined,
            appName: undefined,
            appLogo: undefined,
          },
        }),
        expect.any(Array),
        undefined,
      );
    });

    it("should work without any paywall config", async () => {
      const middlewareWithoutPaywall = paymentMiddleware(payTo, routesConfig, facilitatorConfig);

      mockReq.headers = {
        accept: "text/html",
        "user-agent": "Mozilla/5.0",
      };

      await middlewareWithoutPaywall(mockReq as Request, mockRes as Response, mockNext);

      expect(renderPaywallHtml).toBeCalledWith(
        expect.objectContaining({
          paywall: undefined,
        }),
        expect.any(Array),
        undefined,
      );
    });
  });
});
