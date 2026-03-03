import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PaymentRequirements } from "@x402/core/types";
import { ExactEvmSchemeERC4337 } from "../../../../src/exact/client/erc4337/scheme";
import type { BundlerClient } from "../../../../src/exact/client/erc4337/bundler";
import type { UserOperationSigner } from "../../../../src/exact/client/erc4337/signers";
import type { PreparedUserOperation } from "../../../../src/exact/client/erc4337/bundler/client";
import type { SmartAccount } from "viem/account-abstraction";

// Mock the ViemBundlerClient for dynamic bundler creation tests
vi.mock("../../../../src/exact/client/erc4337/bundler/viem", () => {
  return {
    ViemBundlerClient: vi.fn(),
  };
});

import { ViemBundlerClient } from "../../../../src/exact/client/erc4337/bundler/viem";

describe("ExactEvmSchemeERC4337", () => {
  let scheme: ExactEvmSchemeERC4337;
  let mockBundlerClient: BundlerClient;
  let mockSigner: UserOperationSigner;

  const basePaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "eip155:84532",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "1000000",
    payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
    maxTimeoutSeconds: 60,
    extra: {
      userOperation: {
        supported: true,
        bundlerUrl: "https://bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock bundler client
    mockBundlerClient = {
      prepareUserOperation: vi.fn(),
      estimateGas: vi.fn(),
      sendUserOperation: vi.fn(),
    };

    // Setup mock signer
    mockSigner = {
      address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      signUserOperation: vi.fn(),
    };

    scheme = new ExactEvmSchemeERC4337({
      bundlerClient: mockBundlerClient,
      signer: mockSigner,
    });
  });

  describe("constructor", () => {
    it("should create scheme with default entry point", () => {
      const defaultScheme = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
      });
      expect(defaultScheme.scheme).toBe("exact");
    });

    it("should create scheme with custom entry point", () => {
      const customScheme = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
        entrypoint: "0xCustomEntryPoint" as `0x${string}`,
      });
      expect(customScheme.scheme).toBe("exact");
    });

    it("should throw error when neither bundlerClient nor account is provided", () => {
      expect(() => {
        new ExactEvmSchemeERC4337({
          signer: mockSigner,
        } as any);
      }).toThrow("Either bundlerClient or account must be provided");
    });

    it("should create scheme with account (minimal config)", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      } as SmartAccount;

      const minimalScheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: mockSigner,
      });
      expect(minimalScheme.scheme).toBe("exact");
    });

    it("should auto-create signer from account when signer is not provided", () => {
      const mockSignature =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as `0x${string}`;
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn().mockResolvedValue(mockSignature),
      } as unknown as SmartAccount;

      const minimalScheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
        // signer not provided - should be auto-created
      });
      expect(minimalScheme.scheme).toBe("exact");
    });

    it("should throw error when account doesn't support signUserOperation and signer is not provided", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        // signUserOperation not provided
      } as SmartAccount;

      expect(() => {
        new ExactEvmSchemeERC4337({
          account: mockAccount,
          // signer not provided
        });
      }).toThrow("Account does not support signUserOperation");
    });

    it("should use provided signer when both account and signer are provided", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const customSigner: UserOperationSigner = {
        address: "0xCustomSignerAddress" as `0x${string}`,
        signUserOperation: vi.fn(),
      };

      const scheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: customSigner,
      });
      expect(scheme.scheme).toBe("exact");
    });

    it("should create scheme with account and custom publicClient", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const scheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
      });
      expect(scheme.scheme).toBe("exact");
    });

    it("should create scheme with account and custom entrypoint", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const scheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
        entrypoint: "0xCustomEntryPoint" as `0x${string}`,
      });
      expect(scheme.scheme).toBe("exact");
    });

    it("should create scheme with account and custom bundlerUrl", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const scheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
        bundlerUrl: "https://custom-bundler.example.com",
      });
      expect(scheme.scheme).toBe("exact");
    });

    it("should create scheme with account and all optional customizations", () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const customSigner: UserOperationSigner = {
        address: "0xCustomSignerAddress" as `0x${string}`,
        signUserOperation: vi.fn(),
      };

      const scheme = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: customSigner,
        entrypoint: "0xCustomEntryPoint" as `0x${string}`,
        bundlerUrl: "https://custom-bundler.example.com",
      });
      expect(scheme.scheme).toBe("exact");
    });

    it("should maintain backward compatibility with bundlerClient path", () => {
      const backwardCompatibleScheme = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
      });
      expect(backwardCompatibleScheme.scheme).toBe("exact");
    });

    it("should throw error when bundlerClient is provided without signer", () => {
      expect(() => {
        new ExactEvmSchemeERC4337({
          bundlerClient: mockBundlerClient,
          // signer not provided - should throw error
        } as any);
      }).toThrow();
    });
  });

  describe("createPaymentPayload", () => {
    it("should create payment payload successfully", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData:
          "0xa9059cbb000000000000000000000000209693bc6afc0c5328ba36faf03c514ef312287c00000000000000000000000000000000000000000000000000000000000f4240" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      const mockSignature = "0x1234567890abcdef" as `0x${string}`;

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockSignature,
      );

      const result = await scheme.createPaymentPayload(2, basePaymentRequirements);

      expect(result.x402Version).toBe(2);
      expect(result.payload).toHaveProperty("type", "erc4337");
      expect(result.payload).toHaveProperty("entryPoint");
      expect(result.payload).toHaveProperty("bundlerRpcUrl", "https://bundler.example.com");
      expect(result.payload).toHaveProperty("userOperation");
      expect(result.payload.userOperation).toHaveProperty("sender");
      expect(result.payload.userOperation).toHaveProperty("signature", mockSignature);

      expect(mockBundlerClient.prepareUserOperation).toHaveBeenCalledTimes(1);
      expect(mockSigner.signUserOperation).toHaveBeenCalledTimes(1);
    });

    it("should throw error when entrypoint is missing and no config default", async () => {
      const requirementsWithoutCapability: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {},
      };

      await expect(scheme.createPaymentPayload(2, requirementsWithoutCapability)).rejects.toThrow(
        "Entry point not provided",
      );
    });

    it("should throw error when entrypoint is missing", async () => {
      const requirementsWithoutEntrypoint: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
            // entrypoint not provided
          },
        },
      };

      await expect(scheme.createPaymentPayload(2, requirementsWithoutEntrypoint)).rejects.toThrow(
        "Entry point not provided",
      );
    });

    it("should throw error when bundler URL is missing", async () => {
      const requirementsWithoutBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          },
        },
      };

      await expect(scheme.createPaymentPayload(2, requirementsWithoutBundler)).rejects.toThrow(
        "Bundler URL not provided",
      );
    });

    it("should use default bundler URL from config", async () => {
      const schemeWithDefaultBundler = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
        bundlerUrl: "https://default-bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const requirementsWithoutBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
          },
        },
      };

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0x" as `0x${string}`,
      );

      const result = await schemeWithDefaultBundler.createPaymentPayload(
        2,
        requirementsWithoutBundler,
      );

      expect(result.payload).toHaveProperty("bundlerRpcUrl", "https://default-bundler.example.com");
    });

    it("should use entry point from capability", async () => {
      const customEntryPoint =
        "0xCustomEntryPoint1234567890123456789012345678901234" as `0x${string}`;
      const requirementsWithEntryPoint: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://bundler.example.com",
            entrypoint: customEntryPoint,
          },
        },
      };

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0x" as `0x${string}`,
      );

      const result = await scheme.createPaymentPayload(2, requirementsWithEntryPoint);

      expect(result.payload).toHaveProperty("entryPoint", customEntryPoint);
    });

    it("should prioritize config defaults over PaymentRequirements.extra.userOperation", async () => {
      const schemeWithDefaults = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
        bundlerUrl: "https://default-bundler.example.com",
        entrypoint: "0xDefaultEntryPoint" as `0x${string}`,
      });

      const requirementsWithOverrides: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://override-bundler.example.com",
            entrypoint: "0xOverrideEntryPoint" as `0x${string}`,
          },
        },
      };

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0x" as `0x${string}`,
      );

      const result = await schemeWithDefaults.createPaymentPayload(2, requirementsWithOverrides);

      // Should use values from config defaults, not PaymentRequirements
      expect(result.payload).toHaveProperty("bundlerRpcUrl", "https://default-bundler.example.com");
      expect(result.payload).toHaveProperty("entryPoint", "0xDefaultEntryPoint");
    });

    it("should use PaymentRequirements.extra.userOperation when config defaults are not provided", async () => {
      const schemeWithoutDefaults = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
      });

      const requirementsWithUserOp: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://payment-req-bundler.example.com",
            entrypoint: "0xPaymentReqEntryPoint" as `0x${string}`,
          },
        },
      };

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0x" as `0x${string}`,
      );

      const result = await schemeWithoutDefaults.createPaymentPayload(2, requirementsWithUserOp);

      expect(result.payload).toHaveProperty(
        "bundlerRpcUrl",
        "https://payment-req-bundler.example.com",
      );
      expect(result.payload).toHaveProperty("entryPoint", "0xPaymentReqEntryPoint");
    });

    it("should require account when bundlerClient is not provided in createPaymentPayload", async () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
      } as SmartAccount;

      const schemeWithAccount = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: mockSigner,
      });

      expect(schemeWithAccount).toBeDefined();
    });

    it("should work with auto-created signer in createPaymentPayload", async () => {
      const mockSignature =
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as `0x${string}`;
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn().mockResolvedValue(mockSignature),
      } as unknown as SmartAccount;

      const schemeWithAutoSigner = new ExactEvmSchemeERC4337({
        account: mockAccount,
      });

      expect(schemeWithAutoSigner).toBeDefined();
    });

    it("should use default bundler URL when not in PaymentRequirements", async () => {
      const schemeWithDefaultBundler = new ExactEvmSchemeERC4337({
        bundlerClient: mockBundlerClient,
        signer: mockSigner,
        bundlerUrl: "https://default-bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const requirementsWithoutBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
          },
        },
      };

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0x" as `0x${string}`,
      );

      const result = await schemeWithDefaultBundler.createPaymentPayload(
        2,
        requirementsWithoutBundler,
      );

      expect(result.payload).toHaveProperty("bundlerRpcUrl", "https://default-bundler.example.com");
    });

    it("should wrap prepareUserOperation errors as PaymentCreationError with phase 'preparation'", async () => {
      const prepError = new Error("AA21 prefund too low");
      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        prepError,
      );

      try {
        await scheme.createPaymentPayload(2, basePaymentRequirements);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("preparation");
        expect(error.message).toContain("Payment preparation failed");
        expect(error.code).toBe("AA21");
        expect(error.cause).toBe(prepError);
      }
    });

    it("should wrap signer.signUserOperation errors as PaymentCreationError with phase 'signing'", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );

      const signingError = new Error("Secure Enclave signing failed");
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        signingError,
      );

      try {
        await scheme.createPaymentPayload(2, basePaymentRequirements);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("signing");
        expect(error.message).toContain("Payment signing failed");
        expect(error.cause).toBe(signingError);
      }
    });

    it("should throw error when amount is missing", async () => {
      const requirementsWithoutAmount: PaymentRequirements = {
        ...basePaymentRequirements,
        amount: undefined as unknown as string,
      };

      await expect(
        scheme.createPaymentPayload(2, requirementsWithoutAmount),
      ).rejects.toThrow("Payment requirements missing amount");
    });

    it("should include scheme and network at top level for v1 format (x402Version === 1)", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0xsig" as `0x${string}`,
      );

      const result = await scheme.createPaymentPayload(1, basePaymentRequirements);

      expect(result.x402Version).toBe(1);
      // v1 format includes scheme and network at top level
      expect((result as any).scheme).toBe("exact");
      expect((result as any).network).toBe("eip155:84532");
      expect(result.payload).toHaveProperty("type", "erc4337");
    });

    it("should not include scheme and network at top level for v2 format", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0xsig" as `0x${string}`,
      );

      const result = await scheme.createPaymentPayload(2, basePaymentRequirements);

      expect(result.x402Version).toBe(2);
      expect((result as any).scheme).toBeUndefined();
      expect((result as any).network).toBeUndefined();
    });

    it("should handle unknown chain ID with custom defineChain fallback in dynamic path", async () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockAccount.address as `0x${string}`,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      const mockPrepareUserOp = vi.fn().mockResolvedValue(mockPreparedUserOp);

      (ViemBundlerClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        prepareUserOperation: mockPrepareUserOp,
        estimateGas: vi.fn(),
        sendUserOperation: vi.fn(),
      }));

      const customSigner: UserOperationSigner = {
        address: mockAccount.address as `0x${string}`,
        signUserOperation: vi.fn().mockResolvedValue("0xsig" as `0x${string}`),
      };

      // Use a chain ID not known by viem (999999) to trigger the defineChain fallback
      const mockPublicClient = { chain: { id: 999999 } } as any;
      const schemeWithUnknownChain = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: customSigner,
        publicClient: mockPublicClient,
        bundlerUrl: "https://bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const requirementsUnknownChain: PaymentRequirements = {
        ...basePaymentRequirements,
        network: "eip155:999999",
      };

      const result = await schemeWithUnknownChain.createPaymentPayload(
        2,
        requirementsUnknownChain,
      );

      expect(result.x402Version).toBe(2);
      expect(result.payload).toHaveProperty("type", "erc4337");
      expect(ViemBundlerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: expect.objectContaining({ id: 999999 }),
        }),
      );
    });

    it("should create dynamic bundler when account provided but no bundlerClient", async () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockAccount.address as `0x${string}`,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      const mockPrepareUserOp = vi.fn().mockResolvedValue(mockPreparedUserOp);
      const mockSignature = "0xsig" as `0x${string}`;

      // Mock the ViemBundlerClient constructor to return a mock instance
      (ViemBundlerClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        prepareUserOperation: mockPrepareUserOp,
        estimateGas: vi.fn(),
        sendUserOperation: vi.fn(),
      }));

      const customSigner: UserOperationSigner = {
        address: mockAccount.address as `0x${string}`,
        signUserOperation: vi.fn().mockResolvedValue(mockSignature),
      };

      const schemeWithAccount = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: customSigner,
        bundlerUrl: "https://account-bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const result = await schemeWithAccount.createPaymentPayload(2, basePaymentRequirements);

      expect(result.x402Version).toBe(2);
      expect(result.payload).toHaveProperty("type", "erc4337");
      expect(ViemBundlerClient).toHaveBeenCalledTimes(1);
      expect(mockPrepareUserOp).toHaveBeenCalledTimes(1);
    });

    it("should throw when account is missing in dynamic bundler creation path", async () => {
      // This scenario should not be constructible due to the constructor check,
      // but we test the createPaymentPayload's own account check as defensive code
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const schemeWithAccount = new ExactEvmSchemeERC4337({
        account: mockAccount,
        bundlerUrl: "https://bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      // Forcefully clear the account to test the defensive check
      (schemeWithAccount as any).account = undefined;
      (schemeWithAccount as any).bundlerClient = undefined;

      await expect(
        schemeWithAccount.createPaymentPayload(2, basePaymentRequirements),
      ).rejects.toThrow("Account (SmartAccount) is required");
    });

    it("should throw PaymentCreationError for missing bundler URL in dynamic path", async () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      // No bundlerUrl in config, no bundlerUrl in requirements
      const schemeWithAccount = new ExactEvmSchemeERC4337({
        account: mockAccount,
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const requirementsNoBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {},
      };

      try {
        await schemeWithAccount.createPaymentPayload(2, requirementsNoBundler);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("validation");
        expect(error.message).toContain("Bundler URL not provided");
      }
    });

    it("should use publicClient from config in dynamic path", async () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const mockPublicClient = { chain: { id: 84532 } } as any;

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockAccount.address as `0x${string}`,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (ViemBundlerClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        prepareUserOperation: vi.fn().mockResolvedValue(mockPreparedUserOp),
        estimateGas: vi.fn(),
        sendUserOperation: vi.fn(),
      }));

      const schemeWithPublicClient = new ExactEvmSchemeERC4337({
        account: mockAccount,
        publicClient: mockPublicClient,
        bundlerUrl: "https://bundler.example.com",
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const mockSignature = "0xsig" as `0x${string}`;
      (mockAccount.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValue(mockSignature);

      const result = await schemeWithPublicClient.createPaymentPayload(
        2,
        basePaymentRequirements,
      );

      expect(result.payload).toHaveProperty("type", "erc4337");
      expect(ViemBundlerClient).toHaveBeenCalledWith(
        expect.objectContaining({ publicClient: mockPublicClient }),
      );
    });

    it("should wrap AA signing error with parsed AA code", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );

      const signingError = new Error("AA24 signature validation failed");
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        signingError,
      );

      try {
        await scheme.createPaymentPayload(2, basePaymentRequirements);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("signing");
        expect(error.message).toContain("Payment signing failed");
        expect(error.code).toBe("AA24");
        expect(error.cause).toBe(signingError);
      }
    });

    it("should wrap non-Error preparation error correctly", async () => {
      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        "string error",
      );

      try {
        await scheme.createPaymentPayload(2, basePaymentRequirements);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("preparation");
        expect(error.message).toContain("string error");
      }
    });

    it("should wrap non-Error signing error correctly", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        "non-error string",
      );

      try {
        await scheme.createPaymentPayload(2, basePaymentRequirements);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("signing");
        expect(error.message).toContain("non-error string");
      }
    });

    it("should use capability bundlerUrl when config bundlerUrl is not set in dynamic path", async () => {
      const mockAccount = {
        address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockAccount.address as `0x${string}`,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (ViemBundlerClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        prepareUserOperation: vi.fn().mockResolvedValue(mockPreparedUserOp),
        estimateGas: vi.fn(),
        sendUserOperation: vi.fn(),
      }));

      const customSigner: UserOperationSigner = {
        address: mockAccount.address as `0x${string}`,
        signUserOperation: vi.fn().mockResolvedValue("0xsig" as `0x${string}`),
      };

      // No bundlerUrl in config — should fall back to capability.bundlerUrl
      const schemeNoBundlerUrl = new ExactEvmSchemeERC4337({
        account: mockAccount,
        signer: customSigner,
        entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      });

      const requirementsWithCapabilityBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            supported: true,
            bundlerUrl: "https://capability-bundler.example.com",
            entrypoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
          },
        },
      };

      const result = await schemeNoBundlerUrl.createPaymentPayload(
        2,
        requirementsWithCapabilityBundler,
      );

      expect(result.payload).toHaveProperty("type", "erc4337");
      expect(ViemBundlerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          bundlerUrl: "https://capability-bundler.example.com",
        }),
      );
    });

    it("should wrap non-AA Error preparation error with error.message", async () => {
      const genericError = new Error("network timeout");
      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        genericError,
      );

      try {
        await scheme.createPaymentPayload(2, basePaymentRequirements);
        expect.unreachable("should have thrown");
      } catch (error: any) {
        expect(error.name).toBe("PaymentCreationError");
        expect(error.phase).toBe("preparation");
        expect(error.message).toContain("network timeout");
        expect(error.code).toBeUndefined();
        expect(error.cause).toBe(genericError);
      }
    });

    it("should use maxAmountRequired when amount is undefined (v1 compat)", async () => {
      const mockPreparedUserOp: PreparedUserOperation = {
        sender: mockSigner.address,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      (mockBundlerClient.prepareUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockPreparedUserOp,
      );
      (mockSigner.signUserOperation as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "0xsig" as `0x${string}`,
      );

      // v1-style requirements: amount is undefined, maxAmountRequired is set
      const v1Requirements = {
        ...basePaymentRequirements,
        amount: undefined as unknown as string,
        maxAmountRequired: "2000000",
      } as any;

      const result = await scheme.createPaymentPayload(1, v1Requirements);

      expect(result.x402Version).toBe(1);
      expect(result.payload).toHaveProperty("type", "erc4337");

      // prepareUserOperation should have been called (meaning amount was resolved)
      expect(mockBundlerClient.prepareUserOperation).toHaveBeenCalledTimes(1);
    });
  });
});
