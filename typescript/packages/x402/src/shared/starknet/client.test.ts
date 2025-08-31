import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as starknet from "starknet";
import {
  createStarknetConnectedClient,
  createStarknetProvider,
  getStarknetChainId,
  getLatestBlock,
  getBlock,
  getTransactionReceipt,
  createContractInstance,
  getAccountNonce,
  callContract,
  getStorageAt,
  type StarknetConnectedClient,
} from "./client";
import { Network } from "../../types/shared/network";

// Mock the entire starknet module
vi.mock("starknet", () => ({
  Provider: vi.fn(),
  RpcProvider: vi.fn(),
  Contract: vi.fn(),
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
}));

describe("client", () => {
  let mockProvider: ReturnType<typeof vi.fn>;
  let mockContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock provider with all required methods
    mockProvider = {
      getBlock: vi.fn(),
      getTransactionReceipt: vi.fn(),
      getNonceForAddress: vi.fn(),
      callContract: vi.fn(),
      getStorageAt: vi.fn(),
      getChainId: vi.fn(),
    };

    // Setup mock contract
    mockContract = {
      address: "0x123456789",
      abi: [],
    };

    (starknet.RpcProvider as ReturnType<typeof vi.fn>).mockImplementation(() => mockProvider);
    (starknet.Contract as ReturnType<typeof vi.fn>).mockImplementation(() => mockContract);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createStarknetConnectedClient", () => {
    it("should create client for starknet mainnet", () => {
      const client = createStarknetConnectedClient("starknet");

      expect(client).toEqual({
        provider: mockProvider,
        network: "starknet",
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      });

      expect(starknet.RpcProvider).toHaveBeenCalledWith({
        nodeUrl: starknet.constants.NetworkName.SN_MAIN,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      });
    });

    it("should create client for starknet sepolia", () => {
      const client = createStarknetConnectedClient("starknet-sepolia");

      expect(client).toEqual({
        provider: mockProvider,
        network: "starknet-sepolia",
        chainId: starknet.constants.StarknetChainId.SN_SEPOLIA,
      });

      expect(starknet.RpcProvider).toHaveBeenCalledWith({
        nodeUrl: starknet.constants.NetworkName.SN_SEPOLIA,
        chainId: starknet.constants.StarknetChainId.SN_SEPOLIA,
      });
    });

    it("should throw error for unsupported network", () => {
      expect(() => createStarknetConnectedClient("unsupported-network")).toThrow(
        "Unsupported Starknet network: unsupported-network",
      );
    });
  });

  describe("createStarknetProvider", () => {
    it("should create provider for starknet mainnet", () => {
      const provider = createStarknetProvider("starknet");

      expect(provider).toBe(mockProvider);
      expect(starknet.RpcProvider).toHaveBeenCalledWith({
        nodeUrl: starknet.constants.NetworkName.SN_MAIN,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      });
    });

    it("should create provider for starknet sepolia", () => {
      const provider = createStarknetProvider("starknet-sepolia");

      expect(provider).toBe(mockProvider);
      expect(starknet.RpcProvider).toHaveBeenCalledWith({
        nodeUrl: starknet.constants.NetworkName.SN_SEPOLIA,
        chainId: starknet.constants.StarknetChainId.SN_SEPOLIA,
      });
    });

    it("should throw error for unsupported network", () => {
      expect(() => createStarknetProvider("invalid-network")).toThrow(
        "Unsupported Starknet network: invalid-network",
      );
    });
  });

  describe("getStarknetChainId", () => {
    it("should return correct chain ID for mainnet", () => {
      const chainId = getStarknetChainId("starknet");
      expect(chainId).toBe(starknet.constants.StarknetChainId.SN_MAIN);
    });

    it("should return correct chain ID for sepolia", () => {
      const chainId = getStarknetChainId("starknet-sepolia");
      expect(chainId).toBe(starknet.constants.StarknetChainId.SN_SEPOLIA);
    });

    it("should throw error for unsupported network", () => {
      expect(() => getStarknetChainId("unknown-network")).toThrow(
        "Unsupported Starknet network: unknown-network",
      );
    });
  });

  describe("getLatestBlock", () => {
    let mockClient: StarknetConnectedClient;
    const mockBlockResponse = {
      block_hash: "0xabcdef123456789",
      parent_hash: "0x987654321fedcba",
      block_number: 12345,
      timestamp: 1640995200,
    };

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      mockProvider.getBlock.mockResolvedValue(mockBlockResponse);
    });

    it("should get latest block", async () => {
      const result = await getLatestBlock(mockClient);

      expect(mockProvider.getBlock).toHaveBeenCalledWith("latest");
      expect(result).toEqual(mockBlockResponse);
    });

    it("should handle provider errors", async () => {
      const error = new Error("Network error");
      mockProvider.getBlock.mockRejectedValue(error);

      await expect(getLatestBlock(mockClient)).rejects.toThrow("Network error");
    });
  });

  describe("getBlock", () => {
    let mockClient: StarknetConnectedClient;
    const mockBlockResponse = {
      block_hash: "0xabcdef123456789",
      parent_hash: "0x987654321fedcba",
      block_number: 12345,
      timestamp: 1640995200,
    };

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      mockProvider.getBlock.mockResolvedValue(mockBlockResponse);
    });

    it("should get block by number", async () => {
      const result = await getBlock(mockClient, 12345);

      expect(mockProvider.getBlock).toHaveBeenCalledWith(12345);
      expect(result).toEqual(mockBlockResponse);
    });

    it("should get block by hash", async () => {
      const blockHash = "0xabcdef123456789";
      const result = await getBlock(mockClient, blockHash);

      expect(mockProvider.getBlock).toHaveBeenCalledWith(blockHash);
      expect(result).toEqual(mockBlockResponse);
    });

    it("should get block with 'latest' identifier", async () => {
      const result = await getBlock(mockClient, "latest");

      expect(mockProvider.getBlock).toHaveBeenCalledWith("latest");
      expect(result).toEqual(mockBlockResponse);
    });

    it("should get block with 'pending' identifier", async () => {
      const result = await getBlock(mockClient, "pending");

      expect(mockProvider.getBlock).toHaveBeenCalledWith("pending");
      expect(result).toEqual(mockBlockResponse);
    });
  });

  describe("getTransactionReceipt", () => {
    let mockClient: StarknetConnectedClient;
    const mockReceiptResponse = {
      transaction_hash: "0xabc123def456",
      status: "ACCEPTED_ON_L1",
      block_hash: "0xblock123",
      block_number: 12345,
    };

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceiptResponse);
    });

    it("should get transaction receipt by hash", async () => {
      const txHash = "0xabc123def456";
      const result = await getTransactionReceipt(mockClient, txHash);

      expect(mockProvider.getTransactionReceipt).toHaveBeenCalledWith(txHash);
      expect(result).toEqual(mockReceiptResponse);
    });

    it("should handle transaction not found", async () => {
      const error = new Error("Transaction not found");
      mockProvider.getTransactionReceipt.mockRejectedValue(error);

      await expect(getTransactionReceipt(mockClient, "0xinvalidtxhash")).rejects.toThrow(
        "Transaction not found",
      );
    });
  });

  describe("createContractInstance", () => {
    let mockClient: StarknetConnectedClient;
    const mockAbi = [
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "account", type: "felt252" }],
        outputs: [{ name: "balance", type: "u256" }],
      },
    ];
    const contractAddress = "0x123456789abcdef";

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };
    });

    it("should create contract instance", () => {
      const result = createContractInstance(mockClient, contractAddress, mockAbi);

      expect(starknet.Contract).toHaveBeenCalledWith(mockAbi, contractAddress, mockProvider);
      expect(result).toBe(mockContract);
    });

    it("should handle empty ABI", () => {
      const result = createContractInstance(mockClient, contractAddress, []);

      expect(starknet.Contract).toHaveBeenCalledWith([], contractAddress, mockProvider);
      expect(result).toBe(mockContract);
    });
  });

  describe("getAccountNonce", () => {
    let mockClient: StarknetConnectedClient;
    const accountAddress = "0xabcdef123456789";
    const mockNonce = "5";

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      mockProvider.getNonceForAddress.mockResolvedValue(mockNonce);
    });

    it("should get account nonce", async () => {
      const result = await getAccountNonce(mockClient, accountAddress);

      expect(mockProvider.getNonceForAddress).toHaveBeenCalledWith(accountAddress);
      expect(result).toBe(mockNonce);
    });

    it("should handle nonce retrieval error", async () => {
      const error = new Error("Account not found");
      mockProvider.getNonceForAddress.mockRejectedValue(error);

      await expect(getAccountNonce(mockClient, accountAddress)).rejects.toThrow(
        "Account not found",
      );
    });

    it("should handle zero nonce", async () => {
      mockProvider.getNonceForAddress.mockResolvedValue("0");

      const result = await getAccountNonce(mockClient, accountAddress);
      expect(result).toBe("0");
    });
  });

  describe("callContract", () => {
    let mockClient: StarknetConnectedClient;
    const contractAddress = "0x123456789abcdef";
    const functionName = "balanceOf";
    const calldata = ["0xabcdef123456789"];
    const mockResult = ["1000000", "0"];

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      mockProvider.callContract.mockResolvedValue(mockResult);
    });

    it("should call contract function with calldata", async () => {
      const result = await callContract(mockClient, contractAddress, functionName, calldata);

      expect(mockProvider.callContract).toHaveBeenCalledWith(
        {
          contractAddress,
          entrypoint: functionName,
          calldata,
        },
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it("should call contract function without calldata", async () => {
      const result = await callContract(mockClient, contractAddress, functionName);

      expect(mockProvider.callContract).toHaveBeenCalledWith(
        {
          contractAddress,
          entrypoint: functionName,
          calldata: [],
        },
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it("should call contract function with block identifier", async () => {
      const blockIdentifier = "latest";
      const result = await callContract(
        mockClient,
        contractAddress,
        functionName,
        calldata,
        blockIdentifier,
      );

      expect(mockProvider.callContract).toHaveBeenCalledWith(
        {
          contractAddress,
          entrypoint: functionName,
          calldata,
        },
        blockIdentifier,
      );
      expect(result).toEqual(mockResult);
    });

    it("should handle contract call errors", async () => {
      const error = new Error("Contract call failed");
      mockProvider.callContract.mockRejectedValue(error);

      await expect(
        callContract(mockClient, contractAddress, functionName, calldata),
      ).rejects.toThrow("Contract call failed");
    });

    it("should handle empty calldata array", async () => {
      const result = await callContract(mockClient, contractAddress, functionName, []);

      expect(mockProvider.callContract).toHaveBeenCalledWith(
        {
          contractAddress,
          entrypoint: functionName,
          calldata: [],
        },
        undefined,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe("getStorageAt", () => {
    let mockClient: StarknetConnectedClient;
    const contractAddress = "0x123456789abcdef";
    const storageKey = "0x123";
    const mockStorageValue = "0xabcdef";

    beforeEach(() => {
      mockClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      mockProvider.getStorageAt.mockResolvedValue(mockStorageValue);
    });

    it("should get storage value at key", async () => {
      const result = await getStorageAt(mockClient, contractAddress, storageKey);

      expect(mockProvider.getStorageAt).toHaveBeenCalledWith(
        contractAddress,
        storageKey,
        undefined,
      );
      expect(result).toBe(mockStorageValue);
    });

    it("should get storage value with block identifier", async () => {
      const blockIdentifier = "latest";
      const result = await getStorageAt(mockClient, contractAddress, storageKey, blockIdentifier);

      expect(mockProvider.getStorageAt).toHaveBeenCalledWith(
        contractAddress,
        storageKey,
        blockIdentifier,
      );
      expect(result).toBe(mockStorageValue);
    });

    it("should handle storage retrieval errors", async () => {
      const error = new Error("Storage access failed");
      mockProvider.getStorageAt.mockRejectedValue(error);

      await expect(getStorageAt(mockClient, contractAddress, storageKey)).rejects.toThrow(
        "Storage access failed",
      );
    });

    it("should handle zero storage value", async () => {
      mockProvider.getStorageAt.mockResolvedValue("0x0");

      const result = await getStorageAt(mockClient, contractAddress, storageKey);
      expect(result).toBe("0x0");
    });
  });

  describe("Edge cases", () => {
    it("should handle network name case sensitivity", () => {
      expect(() => createStarknetConnectedClient("STARKNET")).toThrow(
        "Unsupported Starknet network: STARKNET",
      );

      expect(() => createStarknetConnectedClient("Starknet")).toThrow(
        "Unsupported Starknet network: Starknet",
      );
    });

    it("should handle empty network string", () => {
      expect(() => createStarknetConnectedClient("")).toThrow("Unsupported Starknet network: ");
    });

    it("should handle network with spaces", () => {
      expect(() => createStarknetConnectedClient(" starknet ")).toThrow(
        "Unsupported Starknet network:  starknet ",
      );
    });

    it("should handle provider initialization failures", () => {
      (starknet.RpcProvider as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Provider initialization failed");
      });

      expect(() => createStarknetConnectedClient("starknet")).toThrow(
        "Provider initialization failed",
      );
    });

    it("should handle contract instantiation failures", () => {
      const mockClient: StarknetConnectedClient = {
        provider: mockProvider,
        network: "starknet" as Network,
        chainId: starknet.constants.StarknetChainId.SN_MAIN,
      };

      (starknet.Contract as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Contract initialization failed");
      });

      expect(() => createContractInstance(mockClient, "0x123", [])).toThrow(
        "Contract initialization failed",
      );
    });
  });
});
