import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ViemBundlerClient } from "../../../../src/exact/client/erc4337/bundler/viem";
import type { Chain, PublicClient, Transport } from "viem";
import type { SmartAccount } from "viem/account-abstraction";

// Mock viem/account-abstraction's createBundlerClient
const mockPrepareUserOperation = vi.fn();
const mockSendUserOperation = vi.fn();

vi.mock("viem/account-abstraction", async importOriginal => {
  const actual = await importOriginal<typeof import("viem/account-abstraction")>();
  return {
    ...actual,
    createBundlerClient: () => ({
      prepareUserOperation: mockPrepareUserOperation,
      sendUserOperation: mockSendUserOperation,
    }),
  };
});

describe("ViemBundlerClient", () => {
  const mockBundlerUrl = "https://bundler.example.com";

  const mockPublicClient = {} as PublicClient<Transport, Chain>;
  const mockAccount = {
    address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
  } as SmartAccount;
  const mockChain = { id: 84532 } as Chain;

  let client: ViemBundlerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ViemBundlerClient({
      publicClient: mockPublicClient,
      account: mockAccount,
      chain: mockChain,
      bundlerUrl: mockBundlerUrl,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("prepareUserOperation", () => {
    const entryPoint = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as `0x${string}`;
    const calls = [
      {
        to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
        value: 0n,
        data: "0xa9059cbb" as `0x${string}`,
      },
    ];

    it("should extract core UserOp fields", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 1n,
        callData: "0xCallData" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        signature: "0xDummySig" as `0x${string}`,
      });

      const result = await client.prepareUserOperation(calls, entryPoint);

      expect(result.sender).toBe("0xSender");
      expect(result.nonce).toBe(1n);
      expect(result.callData).toBe("0xCallData");
      expect(result.callGasLimit).toBe(50000n);
      expect(result.verificationGasLimit).toBe(100000n);
      expect(result.preVerificationGas).toBe(21000n);
      expect(result.maxFeePerGas).toBe(1000000000n);
      expect(result.maxPriorityFeePerGas).toBe(2000000n);
      expect(result.signature).toBe("0xDummySig");
    });

    it("should extract v0.7 factory fields when present", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 0n,
        callData: "0x" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        factory: "0xFactoryAddress" as `0x${string}`,
        factoryData: "0xFactoryData1234" as `0x${string}`,
        signature: "0x" as `0x${string}`,
      });

      const result = await client.prepareUserOperation(calls, entryPoint);

      expect(result.factory).toBe("0xFactoryAddress");
      expect(result.factoryData).toBe("0xFactoryData1234");
    });

    it("should not include factory fields when absent", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 0n,
        callData: "0x" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        signature: "0x" as `0x${string}`,
      });

      const result = await client.prepareUserOperation(calls, entryPoint);

      expect(result.factory).toBeUndefined();
      expect(result.factoryData).toBeUndefined();
    });

    it("should extract v0.7 paymaster fields", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 0n,
        callData: "0x" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        paymaster: "0xPaymasterAddress" as `0x${string}`,
        paymasterData: "0xPaymasterData5678" as `0x${string}`,
        paymasterVerificationGasLimit: 30000n,
        paymasterPostOpGasLimit: 15000n,
        signature: "0x" as `0x${string}`,
      });

      const result = await client.prepareUserOperation(calls, entryPoint);

      expect(result.paymaster).toBe("0xPaymasterAddress");
      expect(result.paymasterData).toBe("0xPaymasterData5678");
      expect(result.paymasterVerificationGasLimit).toBe(30000n);
      expect(result.paymasterPostOpGasLimit).toBe(15000n);
    });

    it("should not include paymaster fields when absent", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 0n,
        callData: "0x" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        signature: "0x" as `0x${string}`,
      });

      const result = await client.prepareUserOperation(calls, entryPoint);

      expect(result.paymaster).toBeUndefined();
      expect(result.paymasterData).toBeUndefined();
      expect(result.paymasterVerificationGasLimit).toBeUndefined();
      expect(result.paymasterPostOpGasLimit).toBeUndefined();
    });

    it("should extract all v0.7 fields together (factory + paymaster)", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 0n,
        callData: "0x" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        factory: "0xFactory" as `0x${string}`,
        factoryData: "0xFactoryData" as `0x${string}`,
        paymaster: "0xPaymaster" as `0x${string}`,
        paymasterData: "0xPMData" as `0x${string}`,
        paymasterVerificationGasLimit: 30000n,
        paymasterPostOpGasLimit: 15000n,
        signature: "0x" as `0x${string}`,
      });

      const result = await client.prepareUserOperation(calls, entryPoint);

      expect(result.factory).toBe("0xFactory");
      expect(result.factoryData).toBe("0xFactoryData");
      expect(result.paymaster).toBe("0xPaymaster");
      expect(result.paymasterData).toBe("0xPMData");
      expect(result.paymasterVerificationGasLimit).toBe(30000n);
      expect(result.paymasterPostOpGasLimit).toBe(15000n);
    });

    it("should pass calls to viem bundlerClient correctly", async () => {
      mockPrepareUserOperation.mockResolvedValueOnce({
        sender: "0xSender" as `0x${string}`,
        nonce: 0n,
        callData: "0x" as `0x${string}`,
        callGasLimit: 50000n,
        verificationGasLimit: 100000n,
        preVerificationGas: 21000n,
        maxFeePerGas: 1000000000n,
        maxPriorityFeePerGas: 2000000n,
        signature: "0x" as `0x${string}`,
      });

      await client.prepareUserOperation(calls, entryPoint);

      expect(mockPrepareUserOperation).toHaveBeenCalledWith({
        account: mockAccount,
        calls: [
          {
            to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            value: 0n,
            data: "0xa9059cbb",
          },
        ],
      });
    });
  });

  describe("estimateGas", () => {
    it("should throw (not implemented)", async () => {
      await expect(client.estimateGas({} as any, "0x" as `0x${string}`)).rejects.toThrow(
        "estimateGas should be called through prepareUserOperation",
      );
    });
  });
});
