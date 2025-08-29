import { describe, it, expect, vi, beforeEach } from "vitest";
import { wrapFetchWithPayment } from "./index";
import { evm, PaymentRequirements } from "x402/types";

vi.mock("x402/client", () => ({
  createPaymentHeader: vi.fn(),
  selectPaymentRequirements: vi.fn(),
}));

type RequestInitWithRetry = RequestInit & { __is402Retry?: boolean };

describe("fetchWithPayment()", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockWalletClient: typeof evm.SignerWallet;
  let wrappedFetch: ReturnType<typeof wrapFetchWithPayment>;
  const validPaymentRequirements: PaymentRequirements[] = [
    {
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "100000", // 0.1 USDC in base units
      resource: "https://api.example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      payTo: "0x1234567890123456789012345678901234567890",
      maxTimeoutSeconds: 300,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on base-sepolia
    },
  ];

  const createResponse = (status: number, data?: unknown): Response => {
    const response = new Response(JSON.stringify(data), {
      status,
      statusText: status === 402 ? "Payment Required" : "Not Found",
      headers: new Headers(),
    });
    return response;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockFetch = vi.fn();

    mockWalletClient = {
      signMessage: vi.fn(),
    } as unknown as typeof evm.SignerWallet;

    // Mock payment requirements selector
    const { selectPaymentRequirements } = await import("x402/client");
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    wrappedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient);
  });

  it("should return the original response for non-402 status codes", async () => {
    const successResponse = createResponse(200, { data: "success" });
    mockFetch.mockResolvedValue(successResponse);

    const result = await wrappedFetch("https://api.example.com");

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com", undefined);
  });

  it("should handle 402 errors and retry with payment header", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );
    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
    expect(selectPaymentRequirements).toHaveBeenCalledWith(
      validPaymentRequirements,
      undefined,
      "exact",
    );
    expect(createPaymentHeader).toHaveBeenCalledWith(
      mockWalletClient,
      1,
      validPaymentRequirements[0],
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith("https://api.example.com", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": paymentHeader,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      },
      __is402Retry: true,
    } as RequestInitWithRetry);
  });

  it("should not retry if already retried", async () => {
    const errorResponse = createResponse(402, {
      accepts: validPaymentRequirements,
      x402Version: 1,
    });
    mockFetch.mockResolvedValue(errorResponse);

    await expect(
      wrappedFetch("https://api.example.com", {
        __is402Retry: true,
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment already attempted");
  });

  it("should reject if missing request config", async () => {
    const errorResponse = createResponse(402, {
      accepts: validPaymentRequirements,
      x402Version: 1,
    });
    mockFetch.mockResolvedValue(errorResponse);

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Missing fetch request configuration",
    );
  });

  it("should reject if payment amount exceeds default policy limits", async () => {
    const errorResponse = createResponse(402, {
      accepts: [
        {
          ...validPaymentRequirements[0],
          maxAmountRequired: "200000", // 0.2 USDC, which exceeds our default 0.1 USDC limit
        },
      ],
      x402Version: 1,
    });
    mockFetch.mockResolvedValue(errorResponse);

    await expect(
      wrappedFetch("https://api.example.com", {
        method: "GET",
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment amount exceeds policy limits");
  });

  it("should support legacy bigint parameter (backwards compatibility)", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with legacy bigint parameter
    const legacyMaxValue = BigInt(1.5 * 10 ** 6); // 1.5 USDC (higher limit to allow 1 USDC payment)
    const legacyWrappedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, legacyMaxValue);

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await legacyWrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should support new WalletPolicy format", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with WalletPolicy
    const walletPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.20"  // Higher limit using Money shorthand
        }
      }
    };
    const policyWrappedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, walletPolicy);

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await policyWrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should support multi-network WalletPolicy", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with multi-network policy
    const multiNetworkPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.10",
          "base": "$0.25",
          "avalanche": "$0.05"
        }
      }
    };
    const multiNetworkFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, multiNetworkPolicy);

    // Test base payment within its limit
    const basePayment = [{
      ...validPaymentRequirements[0],
      network: "base",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base mainnet
      maxAmountRequired: "200000", // 0.2 USDC within 0.25 limit
    }];

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: basePayment, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await multiNetworkFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should reject payment on unsupported network in WalletPolicy", async () => {
    const { selectPaymentRequirements } = await import("x402/client");
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with limited network policy
    const limitedPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.10"  // Only base-sepolia supported
        }
      }
    };
    const limitedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, limitedPolicy);

    // Payment on unsupported network
    const unsupportedNetworkPayment = [{
      ...validPaymentRequirements[0],
      network: "avalanche",  // Not in policy
      maxAmountRequired: "50000", // Small amount but wrong network
    }];

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: unsupportedNetworkPayment, x402Version: 1 }),
    );

    await expect(
      limitedFetch("https://api.example.com", {
        method: "GET",
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment amount exceeds policy limits");
  });

  it("should support explicit asset policies in WalletPolicy", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with explicit asset policy
    const explicitAssetPolicy = {
      payments: {
        networks: {
          "base-sepolia": {
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e": {  // USDC
              limit: {
                amount: "300000",  // 0.3 USDC
                asset: {
                  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                  decimals: 6,
                  eip712: {
                    name: "USD Coin",
                    version: "2"
                  }
                }
              }
            }
          }
        }
      }
    };
    const explicitAssetFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, explicitAssetPolicy);

    // Payment within explicit asset limit
    const paymentRequirements = [{
      ...validPaymentRequirements[0],
      maxAmountRequired: "250000", // 0.25 USDC within 0.3 limit
    }];

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: paymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await explicitAssetFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should reject unsupported asset in explicit policy", async () => {
    const { selectPaymentRequirements } = await import("x402/client");
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with explicit asset policy
    const explicitAssetPolicy = {
      payments: {
        networks: {
          "base-sepolia": {
            "0x036CbD53842c5426634e7929541eC2318f3dCF7e": {  // Only USDC allowed
              limit: {
                amount: "300000",
                asset: {
                  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                  decimals: 6,
                  eip712: {
                    name: "USD Coin",
                    version: "2"
                  }
                }
              }
            }
          }
        }
      }
    };
    const explicitAssetFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, explicitAssetPolicy);

    // Payment with different asset (DAI instead of USDC)
    const unsupportedAssetPayment = [{
      ...validPaymentRequirements[0],
      asset: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI, not in policy
      maxAmountRequired: "100000",
    }];

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: unsupportedAssetPayment, x402Version: 1 }),
    );

    await expect(
      explicitAssetFetch("https://api.example.com", {
        method: "GET",
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment amount exceeds policy limits");
  });

  it("should support mixed policy format (shorthand + explicit)", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with mixed policy
    const mixedPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$0.10",  // Shorthand for USDC
          "base": {
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": {  // Explicit USDC on Base
              limit: {
                amount: "500000",  // 0.5 USDC
                asset: {
                  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  decimals: 6,
                  eip712: {
                    name: "USD Coin",
                    version: "2"
                  }
                }
              }
            }
          }
        }
      }
    };
    const mixedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, mixedPolicy);

    // Test shorthand network payment first
    const sepoliaPayment = [{
      ...validPaymentRequirements[0],
      network: "base-sepolia",
      maxAmountRequired: "80000", // 0.08 USDC within 0.10 limit
    }];

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: sepoliaPayment, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    let result = await mixedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);

    // Reset mocks and test explicit asset payment
    vi.clearAllMocks();
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    const basePayment = [{
      ...validPaymentRequirements[0],
      network: "base",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base mainnet
      maxAmountRequired: "400000", // 0.4 USDC within 0.5 limit
    }];

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: basePayment, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    result = await mixedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should handle policy with no payments section", async () => {
    const { selectPaymentRequirements } = await import("x402/client");
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Create wrapped fetch with empty policy
    const emptyPolicy = {}; // Policy with no payments
    const emptyPolicyFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, emptyPolicy);

    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
    );

    await expect(
      emptyPolicyFetch("https://api.example.com", {
        method: "GET",
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment amount exceeds policy limits");
  });

  it("should handle edge case with zero amount payment", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Edge case: zero amount payment
    const zeroAmountPayment = [{
      ...validPaymentRequirements[0],
      maxAmountRequired: "0",
    }];

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: zeroAmountPayment, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should validate backwards compatibility with different legacy amounts", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = createResponse(200, { data: "success" });

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Test with different legacy amounts
    const customLegacyValue = BigInt(0.02 * 10 ** 6); // 0.02 USDC
    const legacyWrappedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, customLegacyValue);

    // Payment within legacy limit
    const paymentRequirements = [{
      ...validPaymentRequirements[0],
      maxAmountRequired: "15000", // 0.015 USDC within 0.02 limit
    }];

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, { accepts: paymentRequirements, x402Version: 1 }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await legacyWrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
  });

  it("should reject payment exceeding legacy bigint limit", async () => {
    const legacyMaxValue = BigInt(0.05 * 10 ** 6); // 0.05 USDC
    const legacyWrappedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient, legacyMaxValue);

    const errorResponse = createResponse(402, {
      accepts: [
        {
          ...validPaymentRequirements[0],
          maxAmountRequired: "80000", // 0.08 USDC, exceeds 0.05 USDC limit
        },
      ],
      x402Version: 1,
    });
    mockFetch.mockResolvedValue(errorResponse);

    await expect(
      legacyWrappedFetch("https://api.example.com", {
        method: "GET",
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment amount exceeds policy limits");
  });

  it("should reject if payment header creation fails", async () => {
    const paymentError = new Error("Payment failed");
    const { createPaymentHeader } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockRejectedValue(paymentError);
    mockFetch.mockResolvedValue(
      createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
    );

    await expect(
      wrappedFetch("https://api.example.com", {
        method: "GET",
      } as RequestInitWithRetry),
    ).rejects.toBe(paymentError);
  });
});
