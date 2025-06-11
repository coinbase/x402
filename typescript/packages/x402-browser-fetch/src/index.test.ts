import { describe, it, expect, vi, beforeEach } from "vitest";
import { wrapBrowserFetchWithPayment } from "./index";
import type { PaymentRequirements } from "x402/types";

// Mock the x402 imports
vi.mock("x402/shared", () => ({
  safeBase64Encode: vi.fn((data: string) => btoa(data)),
}));

vi.mock("../../x402/src/schemes/exact/evm/sign", () => ({
  createNonce: vi.fn(() => "0x1234567890123456789012345678901234567890123456789012345678901234"),
}));

vi.mock("../../x402/src/types/shared/evm", () => ({
  authorizationTypes: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
}));

vi.mock("../../x402/src/shared/network", () => ({
  getNetworkId: vi.fn((network: string) => {
    const networkMap: Record<string, number> = {
      "base-sepolia": 84532,
      base: 8453,
    };
    return networkMap[network];
  }),
}));

vi.mock("../../x402/src/types/shared/evm/config", () => ({
  config: {
    "84532": {
      usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      usdcName: "USDC",
    },
    "8453": {
      usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      usdcName: "USDC",
    },
  },
}));

describe("wrapBrowserFetchWithPayment", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockSignTypedData: ReturnType<typeof vi.fn>;
  let wrappedFetch: ReturnType<typeof wrapBrowserFetchWithPayment>;
  const testAccount = "0xabcdef1234567890123456789012345678901234" as const;
  const validPaymentRequirements: PaymentRequirements[] = [
    {
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "100000", // 0.1 USDC in base units
      resource: "https://api.example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      payTo: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      maxTimeoutSeconds: 300,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, // USDC on base-sepolia
    },
  ];

  const createResponse = (status: number, data?: unknown): Response => {
    const response = new Response(JSON.stringify(data), {
      status,
      statusText: status === 402 ? "Payment Required" : status === 200 ? "OK" : "Error",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    return response;
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock sign function
    mockSignTypedData = vi
      .fn()
      .mockResolvedValue(
        "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234",
      ) as ReturnType<typeof vi.fn>;

    wrappedFetch = wrapBrowserFetchWithPayment(testAccount, mockSignTypedData);
  });

  it("should return the original response for non-402 status codes", async () => {
    const successResponse = createResponse(200, { data: "success" });
    mockFetch.mockResolvedValue(successResponse);

    const result = await wrappedFetch("https://api.example.com");

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com", undefined);
    expect(mockSignTypedData).not.toHaveBeenCalled();
  });

  it("should handle 402 errors and retry with payment header", async () => {
    const successResponse = createResponse(200, { data: "success" });

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Check that signTypedData was called with correct parameters
    expect(mockSignTypedData).toHaveBeenCalledWith({
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      domain: {
        name: "USDC",
        version: "2",
        chainId: 84532,
        verifyingContract: validPaymentRequirements[0].asset,
      },
      message: expect.objectContaining({
        from: testAccount,
        to: validPaymentRequirements[0].payTo,
        value: validPaymentRequirements[0].maxAmountRequired,
        validAfter: expect.any(String),
        validBefore: expect.any(String),
        nonce: expect.any(String),
      }),
    });

    // Check that the second call includes the payment header
    expect(mockFetch).toHaveBeenLastCalledWith("https://api.example.com", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": expect.any(String),
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
    });
  });

  it("should throw error when no payment options are available", async () => {
    mockFetch.mockResolvedValue(createResponse(402, { accepts: [], x402Version: 1 }));

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "No payment options available",
    );
  });

  it("should throw error when payment requirements are undefined", async () => {
    mockFetch.mockResolvedValue(createResponse(402, { accepts: [null], x402Version: 1 }));

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Payment requirements undefined",
    );
  });

  it("should reject if payment amount exceeds maximum", async () => {
    const expensivePaymentRequirements = [
      {
        ...validPaymentRequirements[0],
        maxAmountRequired: "200000", // 0.2 USDC, which exceeds our default max of 0.1 USDC
      },
    ];

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: expensivePaymentRequirements, x402Version: 1 }),
    );

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Payment amount (200000) exceeds maximum allowed (100000)",
    );
  });

  it("should handle custom maximum payment amount", async () => {
    const customMaxAmount = BigInt(50000); // 0.05 USDC
    const customWrappedFetch = wrapBrowserFetchWithPayment(
      testAccount,
      mockSignTypedData,
      customMaxAmount,
    );

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
    );

    await expect(customWrappedFetch("https://api.example.com")).rejects.toThrow(
      "Payment amount (100000) exceeds maximum allowed (50000)",
    );
  });

  it("should handle signing errors", async () => {
    const signingError = new Error("User rejected signing");
    (mockSignTypedData as ReturnType<typeof vi.fn>).mockRejectedValue(signingError);

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
    );

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow("User rejected signing");
  });

  it("should handle payment failure responses", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(createResponse(402, { error: "Insufficient balance" }));

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Payment failed: Insufficient balance",
    );
  });

  it("should handle payment failure without error message", async () => {
    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(createResponse(402, {}));

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Payment failed: Unknown error",
    );
  });

  it("should handle insufficient balance errors", async () => {
    const insufficientError = new Error("insufficient funds");
    (mockSignTypedData as ReturnType<typeof vi.fn>).mockRejectedValue(insufficientError);

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
    );

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Insufficient USDC balance to make payment",
    );
  });

  it("should handle unknown errors gracefully", async () => {
    (mockSignTypedData as ReturnType<typeof vi.fn>).mockRejectedValue("String error");

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
    );

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Failed to process payment",
    );
  });

  it("should work with different networks", async () => {
    const basePaymentRequirements: PaymentRequirements[] = [
      {
        ...validPaymentRequirements[0],
        network: "base",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
      },
    ];

    const successResponse = createResponse(200, { data: "success" });

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: basePaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com");

    expect(result).toBe(successResponse);
    expect(mockSignTypedData).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: expect.objectContaining({
          chainId: 8453, // Base mainnet
          verifyingContract: basePaymentRequirements[0].asset,
        }),
      }),
    );
  });
});
