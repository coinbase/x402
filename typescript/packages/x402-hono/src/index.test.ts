import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock first!
vi.mock("x402/shared", () => ({
  ExactEvmMiddleware: vi.fn(),
}));

import { ExactEvmMiddleware } from "x402/shared";
import { Context } from "hono";
import { paymentMiddleware } from "./index";

describe("paymentMiddleware()", () => {
  let mockContext: Context;
  let mockNext: () => Promise<void>;
  let middleware: ReturnType<typeof paymentMiddleware>;
  let mockX402: {
    processRequest: ReturnType<typeof vi.fn>;
    isWebBrowser: ReturnType<typeof vi.fn>;
    generatePaywallHtml: ReturnType<typeof vi.fn>;
    verifyPayment: ReturnType<typeof vi.fn>;
    settlePayment: ReturnType<typeof vi.fn>;
    createErrorResponse: ReturnType<typeof vi.fn>;
  };
  let headersSpy: ReturnType<typeof vi.spyOn>;

  const payTo = "0x1234567890123456789012345678901234567890";
  const routesConfig = {
    "/weather": {
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

    // Setup mock context
    const mockHeaders = new Headers();
    headersSpy = vi.spyOn(mockHeaders, 'set');

    mockContext = {
      req: {
        url: "http://localhost:3000/weather",
        path: "/weather",
        method: "GET",
        header: vi.fn(),
      },
      res: {
        status: 200,
        headers: mockHeaders,
      },
      json: vi.fn(),
      html: vi.fn(),
    } as unknown as Context;

    mockNext = vi.fn();

    // Create middleware instance
    middleware = paymentMiddleware(payTo, routesConfig);
  });

  it("should create ExactEvmMiddleware with correct parameters", () => {
    expect(ExactEvmMiddleware).toHaveBeenCalledWith(payTo, routesConfig, undefined, undefined);
  });

  it("should proceed to next middleware when no payment is required", async () => {
    mockX402.processRequest.mockResolvedValue({ requiresPayment: false });

    await middleware(mockContext, mockNext);

    expect(mockX402.processRequest).toHaveBeenCalledWith(
      "/weather",
      "GET",
      "http://localhost:3000/weather"
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return undefined;
      if (name === "Accept") return "application/json";
      if (name === "User-Agent") return "curl/7.68.0";
      return undefined;
    });

    mockX402.isWebBrowser.mockReturnValue(false);
    mockX402.createErrorResponse.mockReturnValue({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    });

    await middleware(mockContext, mockNext);

    expect(mockX402.isWebBrowser).toHaveBeenCalledWith({
      "user-agent": "curl/7.68.0",
      "accept": "application/json",
    });
    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "X-PAYMENT header is required",
      paymentRequirements
    );
    expect(mockContext.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "X-PAYMENT header is required",
      accepts: paymentRequirements,
    }, 402);
  });

  it("should return HTML paywall for browser requests", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return undefined;
      if (name === "Accept") return "text/html";
      if (name === "User-Agent") return "Mozilla/5.0";
      return undefined;
    });

    mockX402.isWebBrowser.mockReturnValue(true);
    mockX402.generatePaywallHtml.mockReturnValue("<html>Paywall</html>");

    await middleware(mockContext, mockNext);

    expect(mockX402.generatePaywallHtml).toHaveBeenCalledWith(
      paymentRequirements,
      0.001,
      "/weather",
      "base-sepolia",
      undefined
    );
    expect(mockContext.html).toHaveBeenCalledWith("<html>Paywall</html>", 402);
  });

  it("should verify payment and proceed if valid", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return "encoded-payment";
      return undefined;
    });

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    mockX402.settlePayment.mockResolvedValue({
      success: true,
      responseHeader: "settlement-response",
    });

    await middleware(mockContext, mockNext);

    expect(mockX402.verifyPayment).toHaveBeenCalledWith("encoded-payment", paymentRequirements);
    expect(mockNext).toHaveBeenCalled();
    expect(mockX402.settlePayment).toHaveBeenCalledWith(decodedPayment, paymentRequirements[0]);
    expect(headersSpy).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", "settlement-response");
  });

  it("should return 402 if payment verification fails", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return "invalid-payment";
      return undefined;
    });

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

    await middleware(mockContext, mockNext);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "Invalid payment",
      paymentRequirements,
      "0x123"
    );
    expect(mockContext.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "Invalid payment",
      accepts: paymentRequirements,
      payer: "0x123",
    }, 402);
  });

  it("should handle settlement failure", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return "encoded-payment";
      return undefined;
    });

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

    await middleware(mockContext, mockNext);

    expect(mockX402.createErrorResponse).toHaveBeenCalledWith(
      "Settlement failed",
      paymentRequirements
    );
    expect(mockContext.json).toHaveBeenCalledWith({
      x402Version: 1,
      error: "Settlement failed",
      accepts: paymentRequirements,
    }, 402);
  });

  it("should not settle payment if protected route returns status >= 400", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return "encoded-payment";
      return undefined;
    });

    mockX402.verifyPayment.mockResolvedValue({
      success: true,
      decodedPayment,
      selectedRequirements: paymentRequirements[0],
    });

    // Simulate downstream handler setting status 500
    Object.defineProperty(mockContext.res, 'status', { value: 500, writable: true });

    await middleware(mockContext, mockNext);

    expect(mockX402.settlePayment).not.toHaveBeenCalled();
    expect(mockContext.res.status).toBe(500);
  });

  it("should handle custom paywall HTML", async () => {
    const paymentRequirements = [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "1000",
        resource: "http://localhost:3000/weather",
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

    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return undefined;
      if (name === "Accept") return "text/html";
      if (name === "User-Agent") return "Mozilla/5.0";
      return undefined;
    });

    mockX402.isWebBrowser.mockReturnValue(true);

    await middleware(mockContext, mockNext);

    expect(mockX402.generatePaywallHtml).toHaveBeenCalledWith(
      paymentRequirements,
      0.001,
      "/weather",
      "base-sepolia",
      customPaywallHtml
    );
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
