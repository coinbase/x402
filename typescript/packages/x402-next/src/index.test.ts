import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExactEvmMiddleware } from "x402/shared";
import { paymentMiddleware } from "./index";

// Mock the ExactEvmMiddleware class
vi.mock("x402/shared", () => ({
  ExactEvmMiddleware: vi.fn(),
  safeBase64Encode: vi.fn((str: string) => `encoded-${str}`),
}));

// Mock NextResponse
vi.mock("next/server", () => ({
  NextResponse: class MockNextResponse extends Response {
    /**
     * Creates a new NextResponse instance
     *
     * @returns A new MockNextResponse instance
     */
    static next() {
      return new MockNextResponse();
    }
  },
}));

describe("paymentMiddleware()", () => {
  let mockRequest: NextRequest;
  let middleware: ReturnType<typeof paymentMiddleware>;
  let mockX402: {
    processRequest: ReturnType<typeof vi.fn>;
    isWebBrowser: ReturnType<typeof vi.fn>;
    generatePaywallHtml: ReturnType<typeof vi.fn>;
    verifyPayment: ReturnType<typeof vi.fn>;
    settlePayment: ReturnType<typeof vi.fn>;
    createErrorResponse: ReturnType<typeof vi.fn>;
  };

  const payTo = "0x1234567890123456789012345678901234567890";
  const routesConfig = {
    "/protected/*": {
      price: "$0.001",
      network: "base-sepolia" as const,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mock X402 instance
    mockX402 = {
      processRequest: vi.fn(),
      isWebBrowser: vi.fn(),
      generatePaywallHtml: vi.fn(),
      verifyPayment: vi.fn(),
      settlePayment: vi.fn(),
      createErrorResponse: vi.fn(),
    };

    // Mock the ExactEvmMiddleware constructor
    vi.mocked(ExactEvmMiddleware).mockImplementation(
      () => mockX402 as unknown as InstanceType<typeof ExactEvmMiddleware>,
    );

    // Setup request mock
    mockRequest = {
      nextUrl: {
        pathname: "/protected/test",
        protocol: "https:",
        host: "example.com",
      },
      headers: new Headers(),
      method: "GET",
      url: "https://example.com/protected/test",
    } as unknown as NextRequest;

    // Create middleware instance
    middleware = paymentMiddleware(payTo, routesConfig);
  });

  it("should create ExactEvmMiddleware with correct parameters", () => {
    expect(ExactEvmMiddleware).toHaveBeenCalledWith(payTo, routesConfig, undefined, undefined);
  });

  it("should return next() when no payment is required", async () => {
    mockX402.processRequest.mockResolvedValue({ requiresPayment: false });

    const response = await middleware(mockRequest);

    expect(mockX402.processRequest).toHaveBeenCalledWith(
      "/protected/test",
      "GET",
      "https://example.com/protected/test",
    );
    expect(response).toBeInstanceOf(Response);
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
    });

    mockRequest.headers.set("Accept", "application/json");

    mockX402.createErrorResponse.mockReturnValue({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    });

    const response = await middleware(mockRequest);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "X-PAYMENT header is required",
      paymentRequirements,
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should return HTML paywall for browser requests", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
    });

    mockRequest.headers.set("Accept", "text/html");
    mockRequest.headers.set("User-Agent", "Mozilla/5.0");

    mockX402.generatePaywallHtml.mockReturnValue("<html>Paywall</html>");

    const response = await middleware(mockRequest);

    expect(mockX402.generatePaywallHtml).toHaveBeenCalledWith(
      paymentRequirements,
      0.001,
      "https://example.com/protected/test",
      "base-sepolia",
      undefined,
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    const html = await response.text();
    expect(html).toBe("<html>Paywall</html>");
  });

  it("should verify payment and proceed if valid", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    const decodedPayment = {
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

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
    });

    mockRequest.headers.set("X-PAYMENT", "encoded-payment");

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    mockX402.settlePayment.mockResolvedValue({
      success: true,
      responseHeader: "settlement-response",
    });

    const response = await middleware(mockRequest);

    expect(mockX402.verifyPayment).toHaveBeenCalledWith("encoded-payment", paymentRequirements);
    expect(mockX402.settlePayment).toHaveBeenCalledWith(decodedPayment, paymentRequirements[0]);
    expect(response.headers.get("X-PAYMENT-RESPONSE")).toBeDefined();
  });

  it("should return 402 if payment verification fails", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
    });

    mockRequest.headers.set("X-PAYMENT", "invalid-payment");

    mockX402.verifyPayment.mockResolvedValue({
      success: false,
      error: "Invalid payment",
      payer: "0x123",
    });

    mockX402.createErrorResponse.mockReturnValue({
      x402Version: 1,
      error: "Invalid payment",
      accepts: paymentRequirements,
      payer: "0x123",
    });

    const response = await middleware(mockRequest);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "Invalid payment",
      paymentRequirements,
      "0x123",
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should handle settlement failure", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    const decodedPayment = {
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

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
    });

    mockRequest.headers.set("X-PAYMENT", "encoded-payment");

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    mockX402.settlePayment.mockResolvedValue({
      success: false,
      error: "Settlement failed",
    });

    mockX402.createErrorResponse.mockReturnValue({
      x402Version: 1,
      error: "Settlement failed",
      accepts: paymentRequirements,
    });

    const response = await middleware(mockRequest);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "Settlement failed",
      paymentRequirements,
    );
    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    const decodedPayment = {
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

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
    });

    mockRequest.headers.set("X-PAYMENT", "encoded-payment");

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    // Mock NextResponse.next to return a 500 response
    const originalNext = NextResponse.next;
    NextResponse.next = vi
      .fn()
      .mockResolvedValue(new NextResponse("Internal server error", { status: 500 }));

    const response = await middleware(mockRequest);

    expect(response.status).toBe(500);
    expect(mockX402.settlePayment).not.toHaveBeenCalled();

    // Restore original NextResponse.next
    NextResponse.next = originalNext;
  });

  it("should handle custom paywall HTML", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "https://example.com/protected/test",
        description: "",
        mimeType: "application/json",
        payTo: payTo,
        maxTimeoutSeconds: 300,
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        outputSchema: undefined,
        extra: { name: "USDC", version: "2" },
      },
    ];

    const customPaywallHtml = "<html><body>Custom Paywall</body></html>";

    mockX402.processRequest.mockResolvedValue({
      requiresPayment: true,
      paymentRequirements,
      displayAmount: 0.001,
      network: "base-sepolia",
      customPaywallHtml,
    });

    mockRequest.headers.set("Accept", "text/html");
    mockRequest.headers.set("User-Agent", "Mozilla/5.0");

    const response = await middleware(mockRequest);

    expect(mockX402.generatePaywallHtml).toHaveBeenCalledWith(
      paymentRequirements,
      0.001,
      "https://example.com/protected/test",
      "base-sepolia",
      customPaywallHtml,
    );
    expect(response.status).toBe(402);
  });

  it("should handle facilitator and paywall configuration", () => {
    const facilitatorConfig = {
      url: "https://facilitator.example.com" as const,
    };

    const paywallConfig = {
      cdpClientKey: "test-key",
      appName: "Test App",
      appLogo: "/logo.png",
    };

    paymentMiddleware(payTo, routesConfig, facilitatorConfig, paywallConfig);

    expect(ExactEvmMiddleware).toHaveBeenCalledWith(
      payTo,
      routesConfig,
      facilitatorConfig,
      paywallConfig,
    );
  });
});
