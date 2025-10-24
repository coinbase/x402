import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPaywallHtml } from "x402/shared";
import { exact } from "x402/schemes";
import {
  PaymentPayload,
  FacilitatorConfig,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { x402Middleware, X402MiddlewareOptions } from "./index";
import { Address as SolanaAddress } from "@solana/kit";
import type { MiddyRequest } from "@middy/core";

// Mock dependencies
vi.mock("x402/verify", () => ({
  useFacilitator: vi.fn().mockReturnValue({
    verify: vi.fn(),
    settle: vi.fn(),
    supported: vi.fn(),
    list: vi.fn(),
  }),
}));

vi.mock("x402/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getPaywallHtml: vi.fn(),
    toJsonSafe: vi.fn((x) => x),
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

describe("x402Middleware()", () => {
  let mockEvent: Partial<APIGatewayProxyEvent>;
  let mockContext: Partial<Context>;
  let mockRequest: MiddyRequest<APIGatewayProxyEvent, APIGatewayProxyResult>;
  let mockVerify: ReturnType<typeof useFacilitator>["verify"];
  let mockSettle: ReturnType<typeof useFacilitator>["settle"];
  let mockSupported: ReturnType<typeof useFacilitator>["supported"];
  let mockList: ReturnType<typeof useFacilitator>["list"];

  const facilitatorConfig: FacilitatorConfig = {
    url: "https://facilitator.example.com",
  };

  const payTo = "0x1234567890123456789012345678901234567890";

  const middlewareOptions: X402MiddlewareOptions = {
    payTo,
    price: "$0.001",
    network: "base-sepolia",
    config: {
      description: "Test payment",
      mimeType: "application/json",
      maxTimeoutSeconds: 300,
      outputSchema: { type: "object" },
      inputSchema: { queryParams: { type: "string" } },
      resource: "https://api.example.com/resource",
    },
    facilitator: facilitatorConfig,
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

    mockEvent = {
      path: "/test",
      httpMethod: "GET",
      headers: {
        Host: "api.example.com",
      },
      body: null,
      isBase64Encoded: false,
    } as APIGatewayProxyEvent;

    mockContext = {} as Context;

    mockRequest = {
      event: mockEvent as APIGatewayProxyEvent,
      context: mockContext as Context,
      response: undefined,
      error: undefined,
      internal: {},
    };

    mockVerify = vi.fn();
    mockSettle = vi.fn();
    mockSupported = vi.fn();
    mockList = vi.fn();

    vi.mocked(useFacilitator).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
      supported: mockSupported,
      list: mockList,
    });

    // Setup paywall HTML mock
    vi.mocked(getPaywallHtml).mockReturnValue("<html>Paywall</html>");

    // Setup exact.evm mocks
    vi.mocked(exact.evm.encodePayment).mockReturnValue(encodedValidPayment);
    vi.mocked(exact.evm.decodePayment).mockReturnValue(validPayment);
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    expect(mockRequest.response).toBeDefined();
    expect(mockRequest.response?.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response?.body || "{}");
    expect(body).toMatchObject({
      error: "X-PAYMENT header is required",
      x402Version: 1,
    });
    expect(body.accepts).toBeDefined();
  });

  it("should return HTML paywall for browser requests", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0",
    };

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    expect(mockRequest.response?.statusCode).toBe(402);
    expect(mockRequest.response?.body).toBe("<html>Paywall</html>");
  });

  it("should verify payment and proceed if valid", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockVerify).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockRequest.response).toBeUndefined();
    expect((mockRequest.context as any).x402Payment).toBeDefined();
  });

  it("should return 402 if payment verification fails", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": "invalid-payment-header",
    };
    (exact.evm.decodePayment as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Invalid payment");
    });

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    expect(mockRequest.response?.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response?.body || "{}");
    expect(body.error).toBeDefined();
  });

  it("should handle settlement after response", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      transaction: "0x123",
      network: "base-sepolia",
    });

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    // Simulate successful response from handler
    mockRequest.response = {
      statusCode: 200,
      body: JSON.stringify({ data: "test" }),
    };

    await middleware.after?.(mockRequest);

    expect(mockSettle).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockRequest.response.headers?.["X-PAYMENT-RESPONSE"]).toBeDefined();
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    // Simulate error response from handler
    mockRequest.response = {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal error" }),
    };

    await middleware.after?.(mockRequest);

    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("should return 402 for Solana network with feePayer", async () => {
    const solanaPayTo = "CKy5kSzS3K2V4RcedtEa7hC43aYk5tq6z6A4vZnE1fVz";
    const feePayer = "FeePayerAddress12345";
    const supportedResponse = {
      kinds: [
        {
          scheme: "exact",
          network: "solana-devnet",
          extra: { feePayer },
        },
      ],
    };
    (mockSupported as ReturnType<typeof vi.fn>).mockResolvedValue(supportedResponse);

    const solanaOptions: X402MiddlewareOptions = {
      ...middlewareOptions,
      payTo: solanaPayTo as SolanaAddress,
      network: "solana-devnet",
    };

    const middleware = x402Middleware(solanaOptions);
    await middleware.before?.(mockRequest);

    expect(mockRequest.response?.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response?.body || "{}");
    expect(body.accepts).toBeDefined();
    expect(body.accepts[0]).toMatchObject({
      network: "solana-devnet",
      payTo: solanaPayTo,
      extra: {
        feePayer,
      },
    });
  });

  it("should handle unsuccessful settlement", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      errorReason: "invalid_transaction_state",
      transaction: "0x123",
      network: "base-sepolia",
      payer: "0x123",
    });

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    mockRequest.response = {
      statusCode: 200,
      body: JSON.stringify({ data: "test" }),
    };

    await middleware.after?.(mockRequest);

    expect(mockRequest.response.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response.body);
    expect(body.error).toBe("invalid_transaction_state");
  });

  it("should return 402 if payment verification throws an error", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Unexpected error"));

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    expect(mockRequest.response?.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response?.body || "{}");
    expect(body.error).toBe("Unexpected error");
  });

  it("should handle settle throwing an error before response is sent", async () => {
    mockEvent.headers = {
      Host: "api.example.com",
      "X-PAYMENT": encodedValidPayment,
    };
    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));

    const middleware = x402Middleware(middlewareOptions);
    await middleware.before?.(mockRequest);

    mockRequest.response = {
      statusCode: 200,
      body: JSON.stringify({ data: "test" }),
    };

    await middleware.after?.(mockRequest);

    expect(mockRequest.response.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response.body);
    expect(body.error).toBe("Settlement failed");
  });

  it("should return 402 with feePayer for solana mainnet when no payment header is present", async () => {
    const solanaPayTo = "CKy5kSzS3K2V4RcedtEa7hC43aYk5tq6z6A4vZnE1fVz";
    const feePayer = "FeePayerAddressMainnet";
    const supportedResponse = {
      kinds: [
        {
          scheme: "exact",
          network: "solana",
          extra: { feePayer },
        },
      ],
    };
    (mockSupported as ReturnType<typeof vi.fn>).mockResolvedValue(supportedResponse);

    const solanaOptions: X402MiddlewareOptions = {
      ...middlewareOptions,
      payTo: solanaPayTo as SolanaAddress,
      network: "solana",
    };

    const middleware = x402Middleware(solanaOptions);
    await middleware.before?.(mockRequest);

    expect(mockRequest.response?.statusCode).toBe(402);
    const body = JSON.parse(mockRequest.response?.body || "{}");
    expect(body.accepts).toBeDefined();
    expect(body.accepts[0]).toMatchObject({
      network: "solana",
      payTo: solanaPayTo,
      extra: {
        feePayer,
      },
    });
  });

  describe("session token integration", () => {
    it("should pass sessionTokenEndpoint to paywall HTML when configured", async () => {
      const paywallConfig = {
        cdpClientKey: "test-client-key",
        appName: "Test App",
        appLogo: "/test-logo.png",
        sessionTokenEndpoint: "/api/x402/session-token",
      };

      const middlewareWithPaywall = x402Middleware({
        ...middlewareOptions,
        paywall: paywallConfig,
      });

      mockEvent.headers = {
        Host: "api.example.com",
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0",
      };

      await middlewareWithPaywall.before?.(mockRequest);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          cdpClientKey: "test-client-key",
          appName: "Test App",
          appLogo: "/test-logo.png",
          sessionTokenEndpoint: "/api/x402/session-token",
        })
      );
    });

    it("should not pass sessionTokenEndpoint when not configured", async () => {
      const paywallConfig = {
        cdpClientKey: "test-client-key",
        appName: "Test App",
      };

      const middlewareWithPaywall = x402Middleware({
        ...middlewareOptions,
        paywall: paywallConfig,
      });

      mockEvent.headers = {
        Host: "api.example.com",
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0",
      };

      await middlewareWithPaywall.before?.(mockRequest);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          cdpClientKey: "test-client-key",
          appName: "Test App",
          sessionTokenEndpoint: undefined,
        })
      );
    });

    it("should pass sessionTokenEndpoint even when other paywall config is minimal", async () => {
      const paywallConfig = {
        sessionTokenEndpoint: "/custom/session-token",
      };

      const middlewareWithPaywall = x402Middleware({
        ...middlewareOptions,
        paywall: paywallConfig,
      });

      mockEvent.headers = {
        Host: "api.example.com",
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0",
      };

      await middlewareWithPaywall.before?.(mockRequest);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTokenEndpoint: "/custom/session-token",
          cdpClientKey: undefined,
          appName: undefined,
          appLogo: undefined,
        })
      );
    });

    it("should work without any paywall config", async () => {
      const middlewareWithoutPaywall = x402Middleware(middlewareOptions);

      mockEvent.headers = {
        Host: "api.example.com",
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0",
      };

      await middlewareWithoutPaywall.before?.(mockRequest);

      expect(getPaywallHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionTokenEndpoint: undefined,
          cdpClientKey: undefined,
          appName: undefined,
          appLogo: undefined,
        })
      );
    });
  });
});
