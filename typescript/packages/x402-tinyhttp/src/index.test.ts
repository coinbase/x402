import type { Request, Response } from "@tinyhttp/app";
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

// Mock dependencies
vi.mock("x402/verify", () => ({
  useFacilitator: vi.fn().mockReturnValue({
    verify: vi.fn(),
    settle: vi.fn(),
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
  let mockNext: () => void;
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
      protocol: "https",
      originalUrl: "/test",
    } as Request;
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      statusCode: 200,
    } as unknown as Response;
    mockNext = vi.fn();
    mockVerify = vi.fn();
    mockSettle = vi.fn();

    vi.mocked(useFacilitator).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
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
      host: "localhost:3000",
    };
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.send).toHaveBeenCalledWith("<html>Paywall</html>");
  });

  it("should verify payment and proceed if valid", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
      host: "localhost:3000",
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
      host: "localhost:3000",
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
          payTo,
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

  it("should return 402 if payment verification fails with invalid reason", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
      host: "localhost:3000",
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: "0x123",
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "insufficient_funds",
      accepts: expect.any(Array),
      payer: "0x123",
    });
  });

  it("should handle verification errors gracefully", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
      host: "localhost:3000",
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Verification failed"));

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: new Error("Verification failed"),
      accepts: expect.any(Array),
    });
  });

  it("should skip middleware for non-matching routes", async () => {
    mockReq.path = "/unprotected";
    vi.mocked(findMatchingRoute).mockReturnValue(undefined);

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("should settle payment after successful response", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
      host: "localhost:3000",
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({ settled: true });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    // Simulate calling the overridden end method
    if (typeof mockRes.end === "function") {
      (mockRes.end as ReturnType<typeof vi.fn>)("response data");
    }

    expect(mockNext).toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", expect.any(String));
  });

  it("should not settle payment for error responses", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
      host: "localhost:3000",
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    mockRes.statusCode = 500; // Error status

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("should handle settle errors gracefully", async () => {
    mockReq.headers = {
      "x-payment": encodedValidPayment,
      host: "localhost:3000",
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));

    // Mock console.error to avoid test output pollution
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => { });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    // Simulate calling the overridden end method
    if (typeof mockRes.end === "function") {
      (mockRes.end as ReturnType<typeof vi.fn>)("response data");
    }

    expect(mockNext).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to settle payment:",
      new Error("Settlement failed"),
    );

    consoleSpy.mockRestore();
  });
});
