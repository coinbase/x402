import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Network, PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactEvmSchemeNetworkERC4337 } from "../../../../src/exact/facilitator/erc4337/scheme";
import { BundlerClient } from "../../../../src/exact/facilitator/erc4337/bundler/client";
import { BundlerError } from "../../../../src/exact/facilitator/erc4337/bundler/types";

// Mock the BundlerClient
vi.mock("../../../../src/exact/facilitator/erc4337/bundler/client", () => {
  return {
    BundlerClient: vi.fn(),
  };
});

describe("ExactEvmSchemeNetworkERC4337", () => {
  let facilitator: ExactEvmSchemeNetworkERC4337;
  let mockBundlerClient: {
    estimateUserOperationGas: ReturnType<typeof vi.fn>;
    sendUserOperation: ReturnType<typeof vi.fn>;
    getUserOperationReceipt: ReturnType<typeof vi.fn>;
  };

  const basePaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "eip155:84532" as Network,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amount: "1000000",
    payTo: "0x209693Bc6afc0C5328bA36FaF04C514EF312287C",
    maxTimeoutSeconds: 60,
    extra: {},
  };

  const basePaymentPayload: PaymentPayload = {
    x402Version: 2,
    resource: {
      url: "https://api.example.com/resource",
      description: "Test resource",
      mimeType: "application/json",
    },
    accepted: basePaymentRequirements,
    payload: {
      type: "erc4337",
      entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      bundlerRpcUrl: "https://bundler.example.com",
      userOperation: {
        sender: "0x1234567890123456789012345678901234567890",
        nonce: "0x0",
        callData: "0x",
        callGasLimit: "0x1234",
        verificationGasLimit: "0x5678",
        preVerificationGas: "0x9abc",
        maxFeePerGas: "0x1",
        maxPriorityFeePerGas: "0x1",
        signature: "0x",
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock bundler client
    mockBundlerClient = {
      estimateUserOperationGas: vi.fn(),
      sendUserOperation: vi.fn(),
      getUserOperationReceipt: vi.fn(),
    };

    (BundlerClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockBundlerClient,
    );

    facilitator = new ExactEvmSchemeNetworkERC4337();
  });

  describe("constructor", () => {
    it("should create facilitator with default config", () => {
      const defaultFacilitator = new ExactEvmSchemeNetworkERC4337();
      expect(defaultFacilitator.scheme).toBe("exact");
      expect(defaultFacilitator.caipFamily).toBe("eip155:*");
    });

    it("should create facilitator with custom config", () => {
      const customFacilitator = new ExactEvmSchemeNetworkERC4337({
        defaultBundlerUrl: "https://custom-bundler.example.com",
        receiptPollTimeout: 60_000,
        receiptPollInterval: 2_000,
      });
      expect(customFacilitator.scheme).toBe("exact");
    });
  });

  describe("getExtra", () => {
    it("should return undefined", () => {
      const result = facilitator.getExtra("eip155:84532");
      expect(result).toBeUndefined();
    });
  });

  describe("getSigners", () => {
    it("should return empty array", () => {
      const result = facilitator.getSigners("eip155:84532");
      expect(result).toEqual([]);
    });
  });

  describe("verify", () => {
    it("should verify successfully when gas estimation succeeds", async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({
        callGasLimit: "0x1234",
        verificationGasLimit: "0x5678",
        preVerificationGas: "0x9abc",
      });

      const result = await facilitator.verify(basePaymentPayload, basePaymentRequirements);

      expect(result.isValid).toBe(true);
      expect(result.invalidReason).toBeUndefined();
      expect(result.payer).toBe(basePaymentPayload.payload.userOperation.sender);
      expect(mockBundlerClient.estimateUserOperationGas).toHaveBeenCalledTimes(1);
    });

    it("should return invalid when user operation is missing", async () => {
      const payloadWithoutUserOp: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          type: "erc4337",
          entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        },
      };

      const result = await facilitator.verify(payloadWithoutUserOp, basePaymentRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_user_operation");
    });

    it("should return invalid when bundler URL is missing", async () => {
      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      const result = await facilitator.verify(payloadWithoutBundler, basePaymentRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_bundler_url");
    });

    it("should return invalid when entry point is missing", async () => {
      const payloadWithoutEntryPoint: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          entryPoint: undefined as unknown as string,
        },
      };

      const result = await facilitator.verify(payloadWithoutEntryPoint, basePaymentRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_entry_point");
    });

    it("should return invalid when gas estimation fails", async () => {
      mockBundlerClient.estimateUserOperationGas.mockRejectedValueOnce(
        new BundlerError("Simulation failed"),
      );

      const result = await facilitator.verify(basePaymentPayload, basePaymentRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("Simulation failed");
      expect(result.payer).toBe(basePaymentPayload.payload.userOperation.sender);
    });

    it("should use bundler URL from requirements extra if not in payload", async () => {
      const requirementsWithBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            bundlerUrl: "https://bundler-from-requirements.example.com",
          },
        },
      };

      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      await facilitator.verify(payloadWithoutBundler, requirementsWithBundler);

      expect(BundlerClient).toHaveBeenCalledWith("https://bundler-from-requirements.example.com");
    });

    it("should use default bundler URL from config if not in payload or requirements", async () => {
      const facilitatorWithDefault = new ExactEvmSchemeNetworkERC4337({
        defaultBundlerUrl: "https://default-bundler.example.com",
      });

      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      await facilitatorWithDefault.verify(payloadWithoutBundler, basePaymentRequirements);

      expect(BundlerClient).toHaveBeenCalledWith("https://default-bundler.example.com");
    });
  });

  describe("settle", () => {
    it("should settle successfully", async () => {
      // Mock verify (gas estimation)
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      // Mock send user operation
      const mockUserOpHash = "0xuserophash";
      mockBundlerClient.sendUserOperation.mockResolvedValueOnce(mockUserOpHash);

      // Mock receipt polling
      const mockReceipt = {
        userOpHash: mockUserOpHash,
        receipt: {
          transactionHash: "0xtxhash",
        },
      };
      mockBundlerClient.getUserOperationReceipt
        .mockResolvedValueOnce(null) // First poll returns null
        .mockResolvedValueOnce(mockReceipt); // Second poll returns receipt

      const result = await facilitator.settle(basePaymentPayload, basePaymentRequirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash");
      expect(result.network).toBe(basePaymentPayload.accepted.network);
      expect(result.payer).toBe(basePaymentPayload.payload.userOperation.sender);
      expect(result.errorReason).toBeUndefined();
    });

    it("should return invalid if verification fails", async () => {
      mockBundlerClient.estimateUserOperationGas.mockRejectedValueOnce(
        new BundlerError("Simulation failed"),
      );

      const result = await facilitator.settle(basePaymentPayload, basePaymentRequirements);

      expect(result.success).toBe(false);
      expect(result.transaction).toBe("");
      expect(result.errorReason).toBe("Simulation failed");
    });

    it("should return error if bundler URL is missing", async () => {
      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      // Mock verify to succeed
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      const result = await facilitator.settle(payloadWithoutBundler, basePaymentRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("missing_bundler_url");
    });

    it("should return error if sending fails", async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});
      mockBundlerClient.sendUserOperation.mockRejectedValueOnce(new BundlerError("Send failed"));

      const result = await facilitator.settle(basePaymentPayload, basePaymentRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("Send failed");
    });

    it("should use userOpHash as transaction if receipt not found", async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      const mockUserOpHash = "0xuserophash";
      mockBundlerClient.sendUserOperation.mockResolvedValueOnce(mockUserOpHash);

      // Mock receipt polling to always return null (timeout)
      mockBundlerClient.getUserOperationReceipt.mockResolvedValue(null);

      // Use shorter timeout for test
      const fastFacilitator = new ExactEvmSchemeNetworkERC4337({
        receiptPollTimeout: 100,
        receiptPollInterval: 50,
      });

      const result = await fastFacilitator.settle(basePaymentPayload, basePaymentRequirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe(mockUserOpHash);
    });

    it("should handle receipt with transactionHash at root level", async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      const mockUserOpHash = "0xuserophash";
      mockBundlerClient.sendUserOperation.mockResolvedValueOnce(mockUserOpHash);

      const mockReceipt = {
        userOpHash: mockUserOpHash,
        transactionHash: "0xtxhashroot",
      };
      mockBundlerClient.getUserOperationReceipt.mockResolvedValueOnce(mockReceipt);

      const result = await facilitator.settle(basePaymentPayload, basePaymentRequirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhashroot");
    });

    it("should handle receipt with both receipt.transactionHash and transactionHash", async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      const mockUserOpHash = "0xuserophash";
      mockBundlerClient.sendUserOperation.mockResolvedValueOnce(mockUserOpHash);

      const mockReceipt = {
        userOpHash: mockUserOpHash,
        receipt: {
          transactionHash: "0xtxhashinreceipt",
        },
        transactionHash: "0xtxhashroot",
      };
      mockBundlerClient.getUserOperationReceipt.mockResolvedValueOnce(mockReceipt);

      const result = await facilitator.settle(basePaymentPayload, basePaymentRequirements);

      // Should prefer receipt.transactionHash
      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhashinreceipt");
    });

    it("should handle missing entry point in settle", async () => {
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});

      const payloadWithoutEntryPoint: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          entryPoint: undefined as unknown as string,
        },
      };

      const result = await facilitator.settle(payloadWithoutEntryPoint, basePaymentRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("missing_entry_point");
    });

    it("should return missing_bundler_url in settle when verify passes but bundler URL missing in settle", async () => {
      // Spy on verify to return valid despite bundler URL being missing
      const spiedFacilitator = new ExactEvmSchemeNetworkERC4337();
      vi.spyOn(spiedFacilitator, "verify").mockResolvedValueOnce({
        isValid: true,
        invalidReason: undefined,
        payer: "0x1234567890123456789012345678901234567890",
      });

      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      const result = await spiedFacilitator.settle(
        payloadWithoutBundler,
        basePaymentRequirements,
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("missing_bundler_url");
    });

    it("should return missing_entry_point in settle when verify passes but entry point missing in settle", async () => {
      // Spy on verify to return valid despite entry point being missing
      const spiedFacilitator = new ExactEvmSchemeNetworkERC4337();
      vi.spyOn(spiedFacilitator, "verify").mockResolvedValueOnce({
        isValid: true,
        invalidReason: undefined,
        payer: "0x1234567890123456789012345678901234567890",
      });

      const payloadWithoutEntryPoint: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          entryPoint: undefined as unknown as string,
        },
      };

      const result = await spiedFacilitator.settle(
        payloadWithoutEntryPoint,
        basePaymentRequirements,
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("missing_entry_point");
    });

    it("should use bundler URL from requirements.extra in settle", async () => {
      const requirementsWithBundler: PaymentRequirements = {
        ...basePaymentRequirements,
        extra: {
          userOperation: {
            bundlerUrl: "https://bundler-from-requirements.example.com",
          },
        },
      };

      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      // verify will fail because there's no bundlerUrl in payload, but the requirements have it
      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});
      mockBundlerClient.sendUserOperation.mockResolvedValueOnce("0xhash");
      mockBundlerClient.getUserOperationReceipt.mockResolvedValueOnce({
        receipt: { transactionHash: "0xtx" },
      });

      const result = await facilitator.settle(
        payloadWithoutBundler,
        requirementsWithBundler,
      );

      expect(result.success).toBe(true);
    });

    it("should return 'invalid' as default errorReason when verify returns isValid false with no invalidReason", async () => {
      const spiedFacilitator = new ExactEvmSchemeNetworkERC4337();
      vi.spyOn(spiedFacilitator, "verify").mockResolvedValueOnce({
        isValid: false,
        invalidReason: undefined,
        payer: "0x1234567890123456789012345678901234567890",
      });

      const result = await spiedFacilitator.settle(basePaymentPayload, basePaymentRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("invalid");
      expect(result.transaction).toBe("");
    });

    it("should use default bundler URL from config in settle", async () => {
      const facilitatorWithDefault = new ExactEvmSchemeNetworkERC4337({
        defaultBundlerUrl: "https://default-bundler.example.com",
      });

      const payloadWithoutBundler: PaymentPayload = {
        ...basePaymentPayload,
        payload: {
          ...basePaymentPayload.payload,
          bundlerRpcUrl: undefined,
        },
      };

      mockBundlerClient.estimateUserOperationGas.mockResolvedValueOnce({});
      mockBundlerClient.sendUserOperation.mockResolvedValueOnce("0xhash");
      mockBundlerClient.getUserOperationReceipt.mockResolvedValueOnce({
        receipt: { transactionHash: "0xtx" },
      });

      const result = await facilitatorWithDefault.settle(
        payloadWithoutBundler,
        basePaymentRequirements,
      );

      expect(result.success).toBe(true);
    });
  });
});
