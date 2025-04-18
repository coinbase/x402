import { Context } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPaywallHtml } from "x402/shared";
import { exact } from "x402/schemes";
import { GlobalConfig, PaymentMiddlewareConfig, PaymentPayload } from "x402/types";
import { useFacilitator } from "x402/verify";
import { configurePaymentMiddleware } from "./index";

// Mock dependencies
vi.mock("x402/verify", () => ({
  useFacilitator: vi.fn(),
}));

vi.mock("x402/shared", () => ({
  getPaywallHtml: vi.fn(),
  getNetworkId: vi.fn().mockReturnValue("base-sepolia"),
  toJsonSafe: vi.fn(x => x),
}));

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

describe("configurePaymentMiddleware()", () => {
  let mockContext: Context;
  let mockNext: () => Promise<void>;
  let middleware: ReturnType<ReturnType<typeof configurePaymentMiddleware>>;
  let mockVerify: ReturnType<typeof useFacilitator>["verify"];
  let mockSettle: ReturnType<typeof useFacilitator>["settle"];

  const globalConfig: GlobalConfig = {
    facilitatorUrl: "https://facilitator.example.com",
    address: "0x1234567890123456789012345678901234567890",
    network: "base-sepolia",
  };

  const middlewareConfig: PaymentMiddlewareConfig = {
    description: "Test payment",
    mimeType: "application/json",
    maxTimeoutSeconds: 300,
    outputSchema: { type: "object" },
    resource: "https://api.example.com/resource",
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
        url: "/test",
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
    mockSettle = vi.fn() as ReturnType<typeof useFacilitator>["settle"];
    (useFacilitator as ReturnType<typeof vi.fn>).mockReturnValue({
      verify: mockVerify,
      settle: mockSettle,
    });
    (getPaywallHtml as ReturnType<typeof vi.fn>).mockReturnValue("<html>Paywall</html>");

    // Setup exact.evm mocks
    (exact.evm.encodePayment as ReturnType<typeof vi.fn>).mockReturnValue(encodedValidPayment);
    (exact.evm.decodePayment as ReturnType<typeof vi.fn>).mockReturnValue(validPayment);

    middleware = configurePaymentMiddleware(globalConfig)(1.0, middlewareConfig);
  });

  it("should return 402 with payment requirements when no payment header is present", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "Accept") return "application/json";
      return undefined;
    });

    await middleware(mockContext, mockNext);

    expect(mockContext.json).toHaveBeenCalledWith(
      {
        error: "X-PAYMENT header is required",
        paymentRequirements: expect.any(Object),
      },
      402,
    );
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
      if (name === "X-PAYMENT") return encodedValidPayment;
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
      if (name === "X-PAYMENT") return invalidPayment;
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

    expect(mockContext.json).toHaveBeenCalledWith(
      {
        error: expect.any(Error),
        paymentRequirements: expect.any(Object),
      },
      402,
    );
  });

  it("should handle settlement after response", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return encodedValidPayment;
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

    await middleware(mockContext, mockNext);

    expect(exact.evm.decodePayment).toHaveBeenCalledWith(encodedValidPayment);
    expect(mockSettle).toHaveBeenCalledWith(validPayment, expect.any(Object));
    expect(mockContext.header).toHaveBeenCalledWith("X-PAYMENT-RESPONSE", expect.any(String));
    // Restore original json method
    mockContext.json = originalJson;
  });

  it("should handle settlement failure before response is sent", async () => {
    (mockContext.req.header as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
      if (name === "X-PAYMENT") return encodedValidPayment;
      return undefined;
    });

    (mockVerify as ReturnType<typeof vi.fn>).mockResolvedValue({ isValid: true });
    (mockSettle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Settlement failed"));

    await middleware(mockContext, mockNext);

    expect(mockContext.json).toHaveBeenCalledWith(
      {
        error: expect.any(Error),
        paymentRequirements: expect.any(Object),
      },
      402,
    );
  });
});
