import {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { evm, PaymentRequirements } from "x402/types";
import { withPaymentInterceptor } from "./index";

// Mock the createPaymentHeader function
vi.mock("x402/client", () => ({
  createPaymentHeader: vi.fn(),
  selectPaymentRequirements: vi.fn(),
}));

describe("withPaymentInterceptor()", () => {
  let mockAxiosClient: AxiosInstance;
  let mockWalletClient: typeof evm.SignerWallet;
  let interceptor: (error: AxiosError) => Promise<AxiosResponse>;

  const validPaymentRequirements: PaymentRequirements[] = [
    {
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "1000000", // 1 USDC in base units
      resource: "https://api.example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      payTo: "0x1234567890123456789012345678901234567890",
      maxTimeoutSeconds: 300,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on base-sepolia
    },
  ];

  const createErrorConfig = (isRetry = false): InternalAxiosRequestConfig =>
    ({
      headers: new AxiosHeaders(),
      url: "https://api.example.com",
      method: "GET",
      ...(isRetry ? { __is402Retry: true } : {}),
    }) as InternalAxiosRequestConfig;

  const createAxiosError = (
    status: number,
    config?: InternalAxiosRequestConfig,
    data?: { accepts: PaymentRequirements[]; x402Version: number },
  ): AxiosError => {
    return new AxiosError(
      "Error",
      "ERROR",
      config,
      {},
      {
        status,
        statusText: status === 402 ? "Payment Required" : "Not Found",
        data,
        headers: {},
        config: config || createErrorConfig(),
      },
    );
  };

  beforeEach(async () => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Mock axios client
    mockAxiosClient = {
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
      request: vi.fn(),
    } as unknown as AxiosInstance;

    // Mock wallet client
    mockWalletClient = {
      signMessage: vi.fn(),
    } as unknown as typeof evm.SignerWallet;

    // Mock payment requirements selector
    const { selectPaymentRequirements } = await import("x402/client");
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    // Set up the interceptor
    withPaymentInterceptor(mockAxiosClient, mockWalletClient);
    interceptor = (mockAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
  });

  it("should return the axios client instance", () => {
    const result = withPaymentInterceptor(mockAxiosClient, mockWalletClient);
    expect(result).toBe(mockAxiosClient);
  });

  it("should set up response interceptor", () => {
    expect(mockAxiosClient.interceptors.response.use).toHaveBeenCalled();
  });

  it("should not handle non-402 errors", async () => {
    const error = createAxiosError(404);
    await expect(interceptor(error)).rejects.toBe(error);
  });

  it("should handle 402 errors and retry with payment header", async () => {
    const paymentHeader = "payment-header-value";
    const successResponse = { data: "success" } as AxiosResponse;

    // Set up interceptor with higher policy limit to accommodate 1 USDC test payment
    const highLimitAxiosClient = {
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
      request: vi.fn(),
    } as unknown as AxiosInstance;

    const highLimitPolicy = {
      payments: {
        networks: {
          "base-sepolia": "$1.50"  // Higher limit to allow 1 USDC payment
        }
      }
    };

    withPaymentInterceptor(highLimitAxiosClient, mockWalletClient, highLimitPolicy);
    const highLimitInterceptor = (highLimitAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

    const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );
    (highLimitAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

    const error = createAxiosError(402, createErrorConfig(), {
      accepts: validPaymentRequirements,
      x402Version: 1,
    });

    const result = await highLimitInterceptor(error);

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
    expect(highLimitAxiosClient.request).toHaveBeenCalledWith({
      ...error.config,
      headers: new AxiosHeaders({
        "X-PAYMENT": paymentHeader,
        "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
      }),
      __is402Retry: true,
    });
  });

  it("should not retry if already retried", async () => {
    const error = createAxiosError(402, createErrorConfig(true), {
      accepts: validPaymentRequirements,
      x402Version: 1,
    });
    await expect(interceptor(error)).rejects.toBe(error);
  });

  it("should reject if missing request config", async () => {
    const error = createAxiosError(402, undefined, {
      accepts: validPaymentRequirements,
      x402Version: 1,
    });
    await expect(interceptor(error)).rejects.toThrow("Missing axios request configuration");
  });

  it("should reject if payment header creation fails", async () => {
    const paymentError = new Error("Payment failed");
    const { createPaymentHeader } = await import("x402/client");
    (createPaymentHeader as ReturnType<typeof vi.fn>).mockRejectedValue(paymentError);

    // Use smaller amount that passes policy validation (0.05 USDC within default 0.1 USDC limit)
    const smallPaymentRequirements = [{
      ...validPaymentRequirements[0],
      maxAmountRequired: "50000", // 0.05 USDC
    }];

    const error = createAxiosError(402, createErrorConfig(), {
      accepts: smallPaymentRequirements,
      x402Version: 1,
    });
    await expect(interceptor(error)).rejects.toBe(paymentError);
  });

  describe("wallet policy validation", () => {
    it("should allow payments within default policy limits (0.1 USDC)", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (mockAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Payment requiring 0.05 USDC (50000 base units) - within default 0.1 USDC limit
      const smallPaymentRequirements = [{
        ...validPaymentRequirements[0],
        maxAmountRequired: "50000", // 0.05 USDC
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: smallPaymentRequirements,
        x402Version: 1,
      });

      const result = await interceptor(error);
      expect(result).toBe(successResponse);
    });

    it("should reject payments exceeding default policy limits (0.1 USDC)", async () => {
      const { selectPaymentRequirements } = await import("x402/client");
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );

      // Payment requiring 1 USDC (1000000 base units) - exceeds default 0.1 USDC limit
      const largePaymentRequirements = [{
        ...validPaymentRequirements[0],
        maxAmountRequired: "1000000", // 1 USDC
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: largePaymentRequirements,
        x402Version: 1,
      });

      await expect(interceptor(error)).rejects.toThrow("Payment amount exceeds policy limits");
    });

    it("should support custom WalletPolicy with Money shorthand", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      // Set up interceptor with custom policy
      const customAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

      const customPolicy = {
        payments: {
          networks: {
            "base-sepolia": "$0.05"  // Lower limit than default
          }
        }
      };

      withPaymentInterceptor(customAxiosClient, mockWalletClient, customPolicy);
      const customInterceptor = (customAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { selectPaymentRequirements } = await import("x402/client");
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );

      // Payment requiring 0.08 USDC (80000 base units) - exceeds custom 0.05 USDC limit
      const paymentRequirements = [{
        ...validPaymentRequirements[0],
        maxAmountRequired: "80000", // 0.08 USDC
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: paymentRequirements,
        x402Version: 1,
      });

      await expect(customInterceptor(error)).rejects.toThrow("Payment amount exceeds policy limits");
    });

    it("should allow payments within custom policy limits", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      // Set up interceptor with custom policy allowing higher limits
      const highLimitAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

      const highLimitPolicy = {
        payments: {
          networks: {
            "base-sepolia": "$2.00"  // Much higher limit
          }
        }
      };

      withPaymentInterceptor(highLimitAxiosClient, mockWalletClient, highLimitPolicy);
      const customInterceptor = (highLimitAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (highLimitAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Payment requiring 1.5 USDC (1500000 base units) - within custom 2 USDC limit
      const paymentRequirements = [{
        ...validPaymentRequirements[0],
        maxAmountRequired: "1500000", // 1.5 USDC
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: paymentRequirements,
        x402Version: 1,
      });

      const result = await customInterceptor(error);
      expect(result).toBe(successResponse);
    });

    it("should support multi-network policies", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      const multiNetworkAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

      const multiNetworkPolicy = {
        payments: {
          networks: {
            "base-sepolia": "$0.10",
            "base": "$0.25",
            "avalanche": "$0.05"
          }
        }
      };

      withPaymentInterceptor(multiNetworkAxiosClient, mockWalletClient, multiNetworkPolicy);
      const multiNetworkInterceptor = (multiNetworkAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (multiNetworkAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Test payment on base network within its limit
      const basePayment = [{
        ...validPaymentRequirements[0],
        network: "base",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base mainnet
        maxAmountRequired: "200000", // 0.2 USDC within 0.25 limit
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: basePayment,
        x402Version: 1,
      });

      const result = await multiNetworkInterceptor(error);
      expect(result).toBe(successResponse);
    });

    it("should reject payment on unsupported network", async () => {
      const customAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

      const limitedPolicy = {
        payments: {
          networks: {
            "base-sepolia": "$0.10"  // Only base-sepolia supported
          }
        }
      };

      withPaymentInterceptor(customAxiosClient, mockWalletClient, limitedPolicy);
      const limitedInterceptor = (customAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { selectPaymentRequirements } = await import("x402/client");
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );

      // Payment on unsupported network
      const unsupportedNetworkPayment = [{
        ...validPaymentRequirements[0],
        network: "avalanche",  // Not in policy
        maxAmountRequired: "50000", // Small amount but wrong network
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: unsupportedNetworkPayment,
        x402Version: 1,
      });

      await expect(limitedInterceptor(error)).rejects.toThrow("Payment amount exceeds policy limits");
    });

    it("should support explicit asset policies", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      const explicitAssetAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

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

      withPaymentInterceptor(explicitAssetAxiosClient, mockWalletClient, explicitAssetPolicy);
      const explicitAssetInterceptor = (explicitAssetAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (explicitAssetAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Payment within explicit asset limit
      const paymentRequirements = [{
        ...validPaymentRequirements[0],
        maxAmountRequired: "250000", // 0.25 USDC within 0.3 limit
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: paymentRequirements,
        x402Version: 1,
      });

      const result = await explicitAssetInterceptor(error);
      expect(result).toBe(successResponse);
    });

    it("should reject payment for unsupported asset in explicit policy", async () => {
      const explicitAssetAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

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

      withPaymentInterceptor(explicitAssetAxiosClient, mockWalletClient, explicitAssetPolicy);
      const explicitAssetInterceptor = (explicitAssetAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { selectPaymentRequirements } = await import("x402/client");
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );

      // Payment with different asset (DAI instead of USDC)
      const unsupportedAssetPayment = [{
        ...validPaymentRequirements[0],
        asset: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI, not in policy
        maxAmountRequired: "100000",
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: unsupportedAssetPayment,
        x402Version: 1,
      });

      await expect(explicitAssetInterceptor(error)).rejects.toThrow("Payment amount exceeds policy limits");
    });

    it("should support mixed policy format (shorthand + explicit)", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      const mixedAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

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

      withPaymentInterceptor(mixedAxiosClient, mockWalletClient, mixedPolicy);
      const mixedInterceptor = (mixedAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (mixedAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Test shorthand network payment
      const sepoliaPayment = [{
        ...validPaymentRequirements[0],
        network: "base-sepolia",
        maxAmountRequired: "80000", // 0.08 USDC within 0.10 limit
      }];

      let error = createAxiosError(402, createErrorConfig(), {
        accepts: sepoliaPayment,
        x402Version: 1,
      });

      let result = await mixedInterceptor(error);
      expect(result).toBe(successResponse);

      // Reset mocks for second test
      vi.clearAllMocks();
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (mixedAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Test explicit asset payment
      const ethereumPayment = [{
        ...validPaymentRequirements[0],
        network: "base",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxAmountRequired: "400000", // 0.4 USDC within 0.5 limit
      }];

      error = createAxiosError(402, createErrorConfig(), {
        accepts: ethereumPayment,
        x402Version: 1,
      });

      result = await mixedInterceptor(error);
      expect(result).toBe(successResponse);
    });

    it("should handle edge case with zero amount", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = { data: "success" } as AxiosResponse;

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      (mockAxiosClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Edge case: zero amount payment
      const zeroAmountPayment = [{
        ...validPaymentRequirements[0],
        maxAmountRequired: "0",
      }];

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: zeroAmountPayment,
        x402Version: 1,
      });

      const result = await interceptor(error);
      expect(result).toBe(successResponse);
    });

    it("should handle policy with no payments section", async () => {
      const emptyPolicyAxiosClient = {
        interceptors: {
          response: {
            use: vi.fn(),
          },
        },
        request: vi.fn(),
      } as unknown as AxiosInstance;

      const emptyPolicy = {}; // Policy with no payments

      withPaymentInterceptor(emptyPolicyAxiosClient, mockWalletClient, emptyPolicy);
      const emptyPolicyInterceptor = (emptyPolicyAxiosClient.interceptors.response.use as ReturnType<typeof vi.fn>).mock.calls[0][1];

      const { selectPaymentRequirements } = await import("x402/client");
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );

      const error = createAxiosError(402, createErrorConfig(), {
        accepts: validPaymentRequirements,
        x402Version: 1,
      });

      await expect(emptyPolicyInterceptor(error)).rejects.toThrow("Payment amount exceeds policy limits");
    });

  });
});
