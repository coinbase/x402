import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as starknet from "starknet";
import {
  createStarknetSigner,
  isStarknetSigner,
  estimateStarknetFee,
  executeStarknetTransaction,
  signStarknetMessage,
  type StarknetSigner,
} from "./wallet";
import { Network } from "../../types/shared/network";

// Mock the entire starknet module
vi.mock("starknet", () => ({
  Account: vi.fn(),
  Provider: vi.fn(),
  RpcProvider: vi.fn(),
  constants: {
    NetworkName: {
      SN_MAIN: "https://starknet-mainnet.public.blastapi.io",
      SN_SEPOLIA: "https://starknet-sepolia.public.blastapi.io",
    },
    StarknetChainId: {
      SN_MAIN: "0x534e5f4d41494e",
      SN_SEPOLIA: "0x534e5f5345504f4c4941",
    },
  },
  ec: {
    starkCurve: {
      getStarkKey: vi.fn(),
      getPublicKey: vi.fn(),
      getContractAddress: vi.fn(),
    },
  },
  CallData: {
    compile: vi.fn(),
  },
}));

describe("wallet", () => {
  const mockPrivateKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const mockPublicKey = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const mockAddress = "0x1234567890abcdef1234567890abcdef12345678";
  const mockKeyPair = "0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba";

  let mockProvider: ReturnType<typeof vi.fn>;
  let mockAccount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock provider
    mockProvider = {
      getBlock: vi.fn(),
      getTransactionReceipt: vi.fn(),
      getNonceForAddress: vi.fn(),
    };

    // Setup mock account
    mockAccount = {
      estimateFee: vi.fn(),
      execute: vi.fn(),
      signMessage: vi.fn(),
      address: mockAddress,
    };

    // Setup starknet module mocks
    (starknet.RpcProvider as ReturnType<typeof vi.fn>).mockImplementation(() => mockProvider);
    (starknet.Account as ReturnType<typeof vi.fn>).mockImplementation(() => mockAccount);
    (starknet.ec.starkCurve.getStarkKey as ReturnType<typeof vi.fn>).mockReturnValue(mockKeyPair);
    (starknet.ec.starkCurve.getPublicKey as ReturnType<typeof vi.fn>).mockReturnValue(mockPublicKey);
    (starknet.ec.starkCurve.getContractAddress as ReturnType<typeof vi.fn>).mockReturnValue(mockAddress);
    (starknet.CallData.compile as ReturnType<typeof vi.fn>).mockReturnValue([mockPublicKey]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createStarknetSigner", () => {
    it("should create a signer for starknet mainnet", async () => {
      const signer = await createStarknetSigner("starknet", mockPrivateKey);

      expect(signer).toEqual({
        account: mockAccount,
        provider: mockProvider,
        address: mockAddress,
        network: "starknet",
      });

      expect(starknet.RpcProvider).toHaveBeenCalledWith({
        nodeUrl: starknet.constants.NetworkName.SN_MAIN,
      });
    });

    it("should create a signer for starknet sepolia", async () => {
      const signer = await createStarknetSigner("starknet-sepolia", mockPrivateKey);

      expect(signer).toEqual({
        account: mockAccount,
        provider: mockProvider,
        address: mockAddress,
        network: "starknet-sepolia",
      });

      expect(starknet.RpcProvider).toHaveBeenCalledWith({
        nodeUrl: starknet.constants.NetworkName.SN_SEPOLIA,
      });
    });

    it("should handle private key with 0x prefix", async () => {
      const signer = await createStarknetSigner("starknet", mockPrivateKey);

      expect(starknet.ec.starkCurve.getStarkKey).toHaveBeenCalledWith(mockPrivateKey);
      expect(signer.address).toBe(mockAddress);
    });

    it("should handle private key without 0x prefix", async () => {
      const keyWithoutPrefix = mockPrivateKey.slice(2);
      const signer = await createStarknetSigner("starknet", keyWithoutPrefix);

      expect(starknet.ec.starkCurve.getStarkKey).toHaveBeenCalledWith(mockPrivateKey);
      expect(signer.address).toBe(mockAddress);
    });

    it("should throw error for invalid private key format", async () => {
      const invalidKey = "0x123"; // Too short

      await expect(createStarknetSigner("starknet", invalidKey)).rejects.toThrow(
        "Invalid private key format. Expected 64-character hex string.",
      );
    });

    it("should throw error for non-hex private key", async () => {
      const nonHexKey = "0x" + "g".repeat(64); // Invalid hex characters

      await expect(createStarknetSigner("starknet", nonHexKey)).rejects.toThrow(
        "Invalid private key format. Expected 64-character hex string.",
      );
    });

    it("should throw error for unsupported network", async () => {
      await expect(createStarknetSigner("unsupported-network", mockPrivateKey)).rejects.toThrow(
        "Unsupported Starknet network: unsupported-network",
      );
    });

    it("should create Account with correct parameters", async () => {
      await createStarknetSigner("starknet", mockPrivateKey);

      expect(starknet.Account).toHaveBeenCalledWith(mockProvider, mockAddress, mockPrivateKey);
    });

    it("should calculate contract address correctly", async () => {
      await createStarknetSigner("starknet", mockPrivateKey);

      expect(starknet.ec.starkCurve.getContractAddress).toHaveBeenCalledWith(
        mockKeyPair,
        "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f", // OZ Account class hash
        [mockPublicKey],
        0,
      );
    });
  });

  describe("isStarknetSigner", () => {
    it("should return true for valid StarknetSigner", () => {
      const mockSigner: StarknetSigner = {
        account: mockAccount,
        provider: mockProvider,
        address: mockAddress,
        network: "starknet" as Network,
      };

      expect(isStarknetSigner(mockSigner)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isStarknetSigner(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isStarknetSigner(undefined)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isStarknetSigner("string")).toBe(false);
      expect(isStarknetSigner(123)).toBe(false);
      expect(isStarknetSigner(true)).toBe(false);
    });

    it("should return false for object missing required properties", () => {
      expect(isStarknetSigner({})).toBe(false);
      expect(isStarknetSigner({ account: mockAccount })).toBe(false);
      expect(isStarknetSigner({ account: mockAccount, provider: mockProvider })).toBe(false);
    });

    it("should return false for object with invalid property types", () => {
      const invalidSigner = {
        account: mockAccount,
        provider: mockProvider,
        address: 123, // Should be string
        network: "starknet",
      };

      expect(isStarknetSigner(invalidSigner)).toBe(false);
    });
  });

  describe("estimateStarknetFee", () => {
    let mockSigner: StarknetSigner;
    const mockCalls = [
      {
        contractAddress: "0x123",
        entrypoint: "transfer",
        calldata: ["0x456", "1000"],
      },
    ];
    const mockFeeEstimate = {
      overall_fee: "1000000",
      gas_consumed: "5000",
      gas_price: "200",
    };

    beforeEach(() => {
      mockSigner = {
        account: mockAccount,
        provider: mockProvider,
        address: mockAddress,
        network: "starknet" as Network,
      };

      mockAccount.estimateFee.mockResolvedValue(mockFeeEstimate);
    });

    it("should estimate fee for transaction calls", async () => {
      const result = await estimateStarknetFee(mockSigner, mockCalls);

      expect(mockAccount.estimateFee).toHaveBeenCalledWith(mockCalls, undefined);
      expect(result).toEqual(mockFeeEstimate);
    });

    it("should estimate fee with details", async () => {
      const details = { blockIdentifier: "latest" };
      const result = await estimateStarknetFee(mockSigner, mockCalls, details);

      expect(mockAccount.estimateFee).toHaveBeenCalledWith(mockCalls, details);
      expect(result).toEqual(mockFeeEstimate);
    });

    it("should handle estimation errors", async () => {
      const error = new Error("Fee estimation failed");
      mockAccount.estimateFee.mockRejectedValue(error);

      await expect(estimateStarknetFee(mockSigner, mockCalls)).rejects.toThrow(
        "Fee estimation failed",
      );
    });
  });

  describe("executeStarknetTransaction", () => {
    let mockSigner: StarknetSigner;
    const mockCalls = [
      {
        contractAddress: "0x123",
        entrypoint: "transfer",
        calldata: ["0x456", "1000"],
      },
    ];
    const mockTxResponse = {
      transaction_hash: "0xabcdef123456789",
    };

    beforeEach(() => {
      mockSigner = {
        account: mockAccount,
        provider: mockProvider,
        address: mockAddress,
        network: "starknet" as Network,
      };

      mockAccount.execute.mockResolvedValue(mockTxResponse);
    });

    it("should execute transaction calls", async () => {
      const result = await executeStarknetTransaction(mockSigner, mockCalls);

      expect(mockAccount.execute).toHaveBeenCalledWith(mockCalls, undefined, undefined);
      expect(result).toEqual(mockTxResponse);
    });

    it("should execute transaction with details", async () => {
      const details = { maxFee: "1000000" };
      const result = await executeStarknetTransaction(mockSigner, mockCalls, details);

      expect(mockAccount.execute).toHaveBeenCalledWith(mockCalls, undefined, details);
      expect(result).toEqual(mockTxResponse);
    });

    it("should handle execution errors", async () => {
      const error = new Error("Transaction execution failed");
      mockAccount.execute.mockRejectedValue(error);

      await expect(executeStarknetTransaction(mockSigner, mockCalls)).rejects.toThrow(
        "Transaction execution failed",
      );
    });
  });

  describe("signStarknetMessage", () => {
    let mockSigner: StarknetSigner;
    const mockSignature = ["0x123", "0x456"];

    beforeEach(() => {
      mockSigner = {
        account: mockAccount,
        provider: mockProvider,
        address: mockAddress,
        network: "starknet" as Network,
      };

      mockAccount.signMessage.mockResolvedValue(mockSignature);
    });

    it("should sign string message", async () => {
      const message = "Hello, Starknet!";
      const result = await signStarknetMessage(mockSigner, message);

      expect(mockAccount.signMessage).toHaveBeenCalledWith(message);
      expect(result).toEqual(mockSignature);
    });

    it("should sign object message as JSON", async () => {
      const message = { type: "payment", amount: "1000" };
      const result = await signStarknetMessage(mockSigner, message);

      expect(mockAccount.signMessage).toHaveBeenCalledWith(JSON.stringify(message));
      expect(result).toEqual(mockSignature);
    });

    it("should handle signing errors", async () => {
      const error = new Error("Message signing failed");
      mockAccount.signMessage.mockRejectedValue(error);

      await expect(signStarknetMessage(mockSigner, "test message")).rejects.toThrow(
        "Message signing failed",
      );
    });

    it("should handle empty string message", async () => {
      const message = "";
      const result = await signStarknetMessage(mockSigner, message);

      expect(mockAccount.signMessage).toHaveBeenCalledWith(message);
      expect(result).toEqual(mockSignature);
    });

    it("should handle complex nested object", async () => {
      const message = {
        domain: {
          name: "Payment",
          version: "1",
        },
        message: {
          recipient: "0x123",
          amount: "1000",
        },
      };

      const result = await signStarknetMessage(mockSigner, message);

      expect(mockAccount.signMessage).toHaveBeenCalledWith(JSON.stringify(message));
      expect(result).toEqual(mockSignature);
    });
  });

  describe("Network edge cases", () => {
    it("should handle network name variations", async () => {
      // Test case sensitivity
      await expect(createStarknetSigner("STARKNET", mockPrivateKey)).rejects.toThrow(
        "Unsupported Starknet network: STARKNET",
      );

      await expect(createStarknetSigner("Starknet", mockPrivateKey)).rejects.toThrow(
        "Unsupported Starknet network: Starknet",
      );
    });

    it("should handle empty network string", async () => {
      await expect(createStarknetSigner("", mockPrivateKey)).rejects.toThrow(
        "Unsupported Starknet network: ",
      );
    });

    it("should handle network with extra spaces", async () => {
      await expect(createStarknetSigner(" starknet ", mockPrivateKey)).rejects.toThrow(
        "Unsupported Starknet network:  starknet ",
      );
    });
  });

  describe("Private key edge cases", () => {
    it("should handle private key with mixed case", async () => {
      const mixedCaseKey = "0x1234567890AbCdEf1234567890aBcDeF1234567890AbCdEf1234567890aBcDeF";

      const signer = await createStarknetSigner("starknet", mixedCaseKey);

      expect(starknet.ec.starkCurve.getStarkKey).toHaveBeenCalledWith(mixedCaseKey);
      expect(signer.address).toBe(mockAddress);
    });

    it("should handle private key exactly 64 characters", async () => {
      const exactKey = "0x" + "a".repeat(64);

      const signer = await createStarknetSigner("starknet", exactKey);

      expect(starknet.ec.starkCurve.getStarkKey).toHaveBeenCalledWith(exactKey);
      expect(signer.address).toBe(mockAddress);
    });

    it("should reject private key that's too long", async () => {
      const tooLongKey = "0x" + "a".repeat(65);

      await expect(createStarknetSigner("starknet", tooLongKey)).rejects.toThrow(
        "Invalid private key format. Expected 64-character hex string.",
      );
    });

    it("should reject empty private key", async () => {
      await expect(createStarknetSigner("starknet", "")).rejects.toThrow(
        "Invalid private key format. Expected 64-character hex string.",
      );
    });

    it("should reject private key with only 0x", async () => {
      await expect(createStarknetSigner("starknet", "0x")).rejects.toThrow(
        "Invalid private key format. Expected 64-character hex string.",
      );
    });
  });
});
