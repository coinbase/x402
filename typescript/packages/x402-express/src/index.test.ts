import { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPaywallHtml, findMatchingRoute } from "x402/shared";
import { exact } from "x402/schemes";
import {
  PaymentMiddlewareConfig,
  PaymentPayload,
  RoutesConfig,
  FacilitatorConfig,
  RouteConfig,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { paymentMiddleware } from "./index";
import { Address as SolanaAddress } from "@solana/kit";

// Mock dependencies
vi.mock("x402/verify", () => ({
  useFacilitator: vi.fn().mockReturnValue({
    verify: vi.fn(),
    settle: vi.fn(),
    getFeePayer: vi.fn(),
  }),
}));

vi.mock("x402/shared", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPaywallHtml: vi.fn(),
    getNetworkId: vi.fn().mockReturnValue("base-sepolia"),
    toJsonSafe: vi.fn(x => x),
    computeRoutePatterns: vi.fn().mockImplementation(routes => {
      const normalizedRoutes = Object.fromEntries(
        Object.entries(routes).map(([pattern, value]) => [
          pattern,
          typeof value === "string" || typeof value === "number"
            ? ({ price: value, network: "base-sepolia" } as RouteConfig)
            : (value as RouteConfig),
        ]),
      );

      return Object.entries(normalizedRoutes).map(([pattern, routeConfig]) => {
        const [verb, path] = pattern.includes(" ") ? pattern.split(/\s+/) : ["*", pattern];
        if (!path) {
          throw new Error(`Invalid route pattern: ${pattern}`);
        }
        return {
          verb: verb.toUpperCase(),
          pattern: new RegExp(
            `^${path
              .replace(/\*/g, ".*?")
              .replace(/\[([^\]]+)\]/g, "[^/]+")
              .replace(/\//g, "\\/")}$`,
          ),
          config: routeConfig,
        };
      });
    }),
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
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let middleware: ReturnType<typeof paymentMiddleware>;
  let mockVerify: ReturnType<typeof useFacilitator>["verify"];
  let mockSettle: ReturnType<typeof useFacilitator>["settle"];
  let mockGetFeePayer: ReturnType<typeof useFacilitator>["getFeePayer"];

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
    mockReq = {
      path: "/test",
      method: "GET",
      headers: {},
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
    mockNext = vi.fn();
    mockVerify = vi.fn();
    mockSettle = vi.fn();
    mockGetFeePayer = vi.fn();

    vi.mocked(useFacilitator).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
      getFeePayer: mockGetFeePayer,
    });

    // Setup paywall HTML mock
    vi.mocked(getPaywallHtml).mockReturnValue("<html>Paywall</html>");

    // Setup exact.evm mocks
    vi.mocked(exact.evm.encodePayment).mockReturnValue(encodedValidPayment);
    vi.mocked(exact.evm.decodePayment).mockReturnValue(validPayment);

    // Setup route pattern matching mock
    vi.mocked(findMatchingRoute).mockImplementation((routePatterns, path, method) => {
      if (path === "/test" && method === "GET") {
        return {
          pattern: /^\/test$/,
          verb: "GET",
          config: {
            price: "$0.001",
            network: "base-sepolia",
            config: middlewareConfig,
          },
        };
      }
      return undefined;
    });

    middleware = paymentMiddleware(payTo, routesConfig, facilitatorConfig);
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
      "x-payment": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockVerify).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockNext).toHaveBeenCalled();
  });

  it("should return 402 if payment verification fails", async () => {
    mockReq.headers = {
      "x-payment": "invalid-payment-header",
    };
    (exact.evm.decodePayment as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Invalid payment");
    });

    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      invalidReason: "insufficient_funds",
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: new Error("Invalid payment"),
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

  it("should return 402 if payment verification throws an error", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Unexpected error"));

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: new Error("Unexpected error"),
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
      "x-payment": encodedValidPayment,
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

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockSettle).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", expect.any(String));
  });

  it("should handle settle throwing an error before response is sent", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: new Error("Settlement failed"),
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

  it("should handle unsuccessful settle before resource response is sent", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "0x123",
      network: "base-sepolia",
      payer: "0x123",
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "invalid_transaction_state",
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
      "x-payment": encodedValidPayment,
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

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockSettle).toHaveBeenCalledWith(validPayment, expect.any(Object));
    // Should not try to send another response since headers are already sent
    expect(mockRes.status).not.toHaveBeenCalledWith(402);
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
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

  it("should return 402 with feePayer for solana-devnet when no payment header is present", async () => {
    const solanaRoutesConfig: RoutesConfig = {
      "/test": {
        price: "$0.001",
        network: "solana-devnet",
        config: middlewareConfig,
      },
    };
    const solanaPayTo = "CKy5kSzS3K2V4RcedtEa7hC43aYk5tq6z6A4vZnE1fVz";
    const feePayer = "FeePayerAddress12345";
    const feePayerResponse = { feePayer: feePayer };
    (mockGetFeePayer as ReturnType<typeof vi.fn>).mockResolvedValue(feePayerResponse);

    vi.mocked(findMatchingRoute).mockReturnValue({
      pattern: /^\/test$/,
      verb: "GET",
      config: {
        price: "$0.001",
        network: "solana-devnet",
        config: middlewareConfig,
      },
    });

    middleware = paymentMiddleware(
      solanaPayTo as SolanaAddress,
      solanaRoutesConfig,
      facilitatorConfig,
    );

    mockReq.headers = {};
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockGetFeePayer).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        accepts: expect.arrayContaining([
          expect.objectContaining({
            network: "solana-devnet",
            payTo: solanaPayTo,
            extra: expect.objectContaining({
              feePayer: feePayerResponse.feePayer,
            }),
          }),
        ]),
      }),
    );

    const responseJson = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(responseJson.accepts[0].extra.feePayer).toBe(feePayerResponse.feePayer);
  });

  it("should return 402 with feePayer for solana-mainnet when no payment header is present", async () => {
    const solanaRoutesConfig: RoutesConfig = {
      "/test": {
        price: "$0.001",
        network: "solana-mainnet",
        config: middlewareConfig,
      },
    };
    const solanaPayTo = "CKy5kSzS3K2V4RcedtEa7hC43aYk5tq6z6A4vZnE1fVz";
    const feePayer = "FeePayerAddressMainnet";
    const feePayerResponse = { feePayer: feePayer };
    (mockGetFeePayer as ReturnType<typeof vi.fn>).mockResolvedValue(feePayerResponse);

    vi.mocked(findMatchingRoute).mockReturnValue({
      pattern: /^\/test$/,
      verb: "GET",
      config: {
        price: "$0.001",
        network: "solana-mainnet",
        config: middlewareConfig,
      },
    });

    middleware = paymentMiddleware(
      solanaPayTo as SolanaAddress,
      solanaRoutesConfig,
      facilitatorConfig,
    );

    mockReq.headers = {};
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockGetFeePayer).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        accepts: expect.arrayContaining([
          expect.objectContaining({
            network: "solana-mainnet",
            payTo: solanaPayTo,
            extra: expect.objectContaining({
              feePayer: feePayerResponse.feePayer,
            }),
          }),
        ]),
      }),
    );

    const responseJson = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(responseJson.accepts[0].extra.feePayer).toBe(feePayerResponse.feePayer);
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

        mockReq.headers = {
          accept: "text/html",
          "user-agent": "Mozilla/5.0",
        };

        await middlewareWithPaywall(mockReq as Request, mockRes as Response, mockNext);

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

        mockReq.headers = {
          accept: "text/html",
          "user-agent": "Mozilla/5.0",
        };

        await middlewareWithPaywall(mockReq as Request, mockRes as Response, mockNext);

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

        mockReq.headers = {
          accept: "text/html",
          "user-agent": "Mozilla/5.0",
        };

        await middlewareWithoutPaywall(mockReq as Request, mockRes as Response, mockNext);

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
});
