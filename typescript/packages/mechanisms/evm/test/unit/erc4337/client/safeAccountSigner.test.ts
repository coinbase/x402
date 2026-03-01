import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SmartAccount } from "viem/account-abstraction";
import { SafeAccountSigner } from "../../../../src/exact/client/erc4337/signers/safeAccountSigner";
import type { PreparedUserOperation } from "../../../../src/exact/client/erc4337/bundler/client";

describe("SafeAccountSigner", () => {
  let mockAccount: SmartAccount;
  const mockAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const mockSignature =
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as `0x${string}`;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAccount = {
      address: mockAddress,
      signUserOperation: vi.fn().mockResolvedValue(mockSignature),
    } as unknown as SmartAccount;
  });

  describe("constructor", () => {
    it("should create SafeAccountSigner with valid SmartAccount", () => {
      const signer = new SafeAccountSigner(mockAccount);
      expect(signer.address).toBe(mockAddress);
    });

    it("should throw error when account is null", () => {
      expect(() => {
        new SafeAccountSigner(null as unknown as SmartAccount);
      }).toThrow("Smart account not initialized");
    });

    it("should throw error when account is undefined", () => {
      expect(() => {
        new SafeAccountSigner(undefined as unknown as SmartAccount);
      }).toThrow("Smart account not initialized");
    });

    it("should throw error when account address is missing", () => {
      const accountWithoutAddress = {
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      expect(() => {
        new SafeAccountSigner(accountWithoutAddress);
      }).toThrow("Smart account not initialized");
    });

    it("should throw error when account address is null", () => {
      const accountWithNullAddress = {
        address: null,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      expect(() => {
        new SafeAccountSigner(accountWithNullAddress);
      }).toThrow("Smart account not initialized");
    });

    it("should throw error when account address is undefined", () => {
      const accountWithUndefinedAddress = {
        address: undefined,
        signUserOperation: vi.fn(),
      } as unknown as SmartAccount;

      expect(() => {
        new SafeAccountSigner(accountWithUndefinedAddress);
      }).toThrow("Smart account not initialized");
    });
  });

  describe("signUserOperation", () => {
    it("should sign user operation successfully", async () => {
      const signer = new SafeAccountSigner(mockAccount);
      const userOp: PreparedUserOperation = {
        sender: mockAddress,
        nonce: BigInt(0),
        callData:
          "0xa9059cbb000000000000000000000000209693bc6afc0c5328ba36faf03c514ef312287c00000000000000000000000000000000000000000000000000000000000f4240" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      const signature = await signer.signUserOperation(userOp);

      expect(signature).toBe(mockSignature);
      expect(mockAccount.signUserOperation).toHaveBeenCalledTimes(1);
      expect(mockAccount.signUserOperation).toHaveBeenCalledWith(userOp);
    });

    it("should throw error when account does not support signUserOperation", async () => {
      const accountWithoutSignMethod = {
        address: mockAddress,
      } as unknown as SmartAccount;

      const signer = new SafeAccountSigner(accountWithoutSignMethod);
      const userOp: PreparedUserOperation = {
        sender: mockAddress,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      await expect(signer.signUserOperation(userOp)).rejects.toThrow(
        "Smart account does not support signUserOperation",
      );
    });

    it("should throw error when account signUserOperation is null", async () => {
      const accountWithNullSignMethod = {
        address: mockAddress,
        signUserOperation: null,
      } as unknown as SmartAccount;

      const signer = new SafeAccountSigner(accountWithNullSignMethod);
      const userOp: PreparedUserOperation = {
        sender: mockAddress,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      await expect(signer.signUserOperation(userOp)).rejects.toThrow(
        "Smart account does not support signUserOperation",
      );
    });

    it("should propagate errors from account signUserOperation", async () => {
      const errorMessage = "Signing failed";
      const accountWithFailingSign = {
        address: mockAddress,
        signUserOperation: vi.fn().mockRejectedValue(new Error(errorMessage)),
      } as unknown as SmartAccount;

      const signer = new SafeAccountSigner(accountWithFailingSign);
      const userOp: PreparedUserOperation = {
        sender: mockAddress,
        nonce: BigInt(0),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
      };

      await expect(signer.signUserOperation(userOp)).rejects.toThrow(errorMessage);
      expect(accountWithFailingSign.signUserOperation).toHaveBeenCalledTimes(1);
    });

    it("should handle user operation with paymaster fields", async () => {
      const signer = new SafeAccountSigner(mockAccount);
      const userOp: PreparedUserOperation = {
        sender: mockAddress,
        nonce: BigInt(1),
        callData: "0x" as `0x${string}`,
        callGasLimit: BigInt(50000),
        verificationGasLimit: BigInt(100000),
        preVerificationGas: BigInt(21000),
        maxFeePerGas: BigInt(1000000000),
        maxPriorityFeePerGas: BigInt(1000000000),
        paymaster: "0xPaymaster1234567890123456789012345678901234" as `0x${string}`,
        paymasterData: "0x1234" as `0x${string}`,
        paymasterVerificationGasLimit: BigInt(50000),
        paymasterPostOpGasLimit: BigInt(30000),
      };

      const signature = await signer.signUserOperation(userOp);

      expect(signature).toBe(mockSignature);
      expect(mockAccount.signUserOperation).toHaveBeenCalledWith(userOp);
    });
  });

  describe("UserOperationSigner interface compliance", () => {
    it("should implement UserOperationSigner interface correctly", () => {
      const signer = new SafeAccountSigner(mockAccount);

      expect(signer).toHaveProperty("address");
      expect(signer).toHaveProperty("signUserOperation");
      expect(typeof signer.signUserOperation).toBe("function");
    });

    it("should have readonly address property", () => {
      const signer = new SafeAccountSigner(mockAccount);
      expect(signer.address).toBe(mockAddress);
    });
  });
});
