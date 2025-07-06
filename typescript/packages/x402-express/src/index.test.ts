import { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExactEvmMiddleware } from "x402/shared";
import { paymentMiddleware } from "./index";

// Mock the ExactEvmMiddleware class
vi.mock("x402/shared", () => ({
  ExactEvmMiddleware: vi.fn(),
}));

describe("paymentMiddleware()", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
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
    "/test": {
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
    vi.mocked(ExactEvmMiddleware).mockImplementation(() => mockX402 as any);

    // Setup mock request
    mockReq = {
      path: "/test",
      method: "GET",
      protocol: "http",
      headers: {
        host: "localhost:3000",
      },
      header: function (name: string) {
        return this.headers[name.toLowerCase()];
      },
      originalUrl: "/test",
    } as Request;

    // Setup mock response
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      headersSent: false,
      statusCode: 200,
    } as unknown as Response;

    mockNext = vi.fn();

    // Create middleware instance
    middleware = paymentMiddleware(payTo, routesConfig);
  });

  it("should create ExactEvmMiddleware with correct parameters", () => {
    expect(ExactEvmMiddleware).toHaveBeenCalledWith(payTo, routesConfig, undefined, undefined);
  });

  it("should proceed to next middleware when no payment is required", async () => {
    mockX402.processRequest.mockResolvedValue({ requiresPayment: false });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.processRequest).toHaveBeenCalledWith(
      "/test",
      "GET",
      "http://localhost:3000/test"
    );
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockX402.isWebBrowser.mockReturnValue(false);
    mockX402.createErrorResponse.mockReturnValue({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.isWebBrowser).toHaveBeenCalledWith(mockReq.headers);
    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "X-PAYMENT header is required",
      paymentRequirements
    );
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    });
  });

  it("should return HTML paywall for browser requests", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockX402.isWebBrowser.mockReturnValue(true);
    mockX402.generatePaywallHtml.mockReturnValue("<html>Paywall</html>");

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.generatePaywallHtml).toHaveBeenCalledWith(
      paymentRequirements,
      0.001,
      "/test",
      "base-sepolia",
      undefined
    );
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.send).toHaveBeenCalledWith("<html>Paywall</html>");
  });

  it("should verify payment and proceed if valid", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockReq.headers = { "x-payment": "encoded-payment" };

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    mockX402.settlePayment.mockResolvedValue({
      success: true,
      responseHeader: "settlement-response",
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.verifyPayment).toHaveBeenCalledWith("encoded-payment", paymentRequirements);
    expect(mockNext).toHaveBeenCalled();
    expect(mockX402.settlePayment).toHaveBeenCalledWith(decodedPayment, paymentRequirements[0]);
    expect(mockRes.setHeader).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", "settlement-response");
  });

  it("should return 402 if payment verification fails", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockReq.headers = { "x-payment": "invalid-payment" };

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

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "Invalid payment",
      paymentRequirements,
      "0x123"
    );
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "Invalid payment",
      accepts: paymentRequirements,
      payer: "0x123",
    });
  });

  it("should handle settlement failure before response is sent", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockReq.headers = { "x-payment": "encoded-payment" };

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

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "Settlement failed",
      paymentRequirements
    );
    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockRes.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "Settlement failed",
      accepts: paymentRequirements,
    });
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockReq.headers = { "x-payment": "encoded-payment" };

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    // Simulate downstream handler setting status 500
    mockRes.statusCode = 500;

    // Mock response.end to capture arguments
    const endArgs: Parameters<Response["end"]>[] = [];
    const originalEnd = mockRes.end;
    mockRes.end = vi.fn().mockImplementation((...args: Parameters<Response["end"]>) => {
      endArgs.push(args);
      return mockRes as any;
    });

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.settlePayment).not.toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(500);
  });

  it("should handle settlement failure after response is sent", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockReq.headers = { "x-payment": "encoded-payment" };

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    mockX402.settlePayment.mockResolvedValue({
      success: false,
      error: "Settlement failed",
    });

    // Simulate headers already sent
    mockRes.headersSent = true;

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.settlePayment).toHaveBeenCalledWith(decodedPayment, paymentRequirements[0]);
    // Should not try to send another response since headers are already sent
    expect(mockRes.status).not.toHaveBeenCalledWith(402);
  });

  it("should handle custom paywall HTML", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/test",
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

    mockX402.isWebBrowser.mockReturnValue(true);

    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockX402.generatePaywallHtml).toHaveBeenCalledWith(
      paymentRequirements,
      0.001,
      "/test",
      "base-sepolia",
      customPaywallHtml
    );
    expect(mockRes.status).toHaveBeenCalledWith(402);
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
      paywallConfig
    );
  });
});
