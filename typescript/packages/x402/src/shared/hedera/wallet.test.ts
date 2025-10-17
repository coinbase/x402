/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";
import {
  createHederaConnectedClient,
  createHederaSigner,
  isHederaSigner,
  type HederaConnectedClient,
  type HederaSigner,
} from "./wallet";

// Mock Hedera SDK
vi.mock("@hashgraph/sdk", () => ({
  AccountId: {
    fromString: vi.fn(),
  },
  Client: {
    forTestnet: vi.fn(),
    forMainnet: vi.fn(),
  },
  PrivateKey: {
    fromStringECDSA: vi.fn(),
  },
}));

describe("Hedera Wallet Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createHederaConnectedClient", () => {
    it("should create testnet client", () => {
      // Arrange
      const mockClient = { network: "testnet" } as any;
      vi.mocked(Client.forTestnet).mockReturnValue(mockClient);

      // Act
      const result = createHederaConnectedClient("hedera-testnet");

      // Assert
      expect(Client.forTestnet).toHaveBeenCalledOnce();
      expect(result).toBe(mockClient);
    });

    it("should create mainnet client", () => {
      // Arrange
      const mockClient = { network: "mainnet" } as any;
      vi.mocked(Client.forMainnet).mockReturnValue(mockClient);

      // Act
      const result = createHederaConnectedClient("hedera-mainnet");

      // Assert
      expect(Client.forMainnet).toHaveBeenCalledOnce();
      expect(result).toBe(mockClient);
    });

    it("should throw error for unsupported network", () => {
      // Act & Assert
      expect(() => createHederaConnectedClient("unsupported-network")).toThrow(
        "Unsupported Hedera network: unsupported-network"
      );
    });

    it("should throw error for empty network", () => {
      // Act & Assert
      expect(() => createHederaConnectedClient("")).toThrow(
        "Unsupported Hedera network: "
      );
    });

    it("should throw error for null network", () => {
      // Act & Assert
      expect(() => createHederaConnectedClient(null as any)).toThrow(
        "Unsupported Hedera network: null"
      );
    });
  });

  describe("createHederaSigner", () => {
    let mockClient: any;
    let mockAccountId: any;
    let mockPrivateKey: any;
    let mockClientWithSetOperator: any;

    beforeEach(() => {
      mockClient = { network: "testnet" };
      mockAccountId = { toString: () => "0.0.123456" };
      mockPrivateKey = { toString: () => "private-key" };
      mockClientWithSetOperator = {
        ...mockClient,
        setOperator: vi.fn(),
      };

      vi.mocked(Client.forTestnet).mockReturnValue(mockClientWithSetOperator as any);
      vi.mocked(AccountId.fromString).mockReturnValue(mockAccountId);
      vi.mocked(PrivateKey.fromStringECDSA).mockReturnValue(mockPrivateKey);
    });

    it("should create signer with valid parameters", () => {
      // Arrange
      const network = "hedera-testnet";
      const privateKeyString = "302e020100300506032b657004220420...";
      const accountId = "0.0.123456";

      // Act
      const result = createHederaSigner(network, privateKeyString, accountId);

      // Assert
      expect(Client.forTestnet).toHaveBeenCalledOnce();
      expect(AccountId.fromString).toHaveBeenCalledWith(accountId);
      expect(PrivateKey.fromStringECDSA).toHaveBeenCalledWith(privateKeyString);
      expect(mockClientWithSetOperator.setOperator).toHaveBeenCalledWith(mockAccountId, mockPrivateKey);

      expect(result).toEqual({
        client: mockClientWithSetOperator,
        accountId: mockAccountId,
        privateKey: mockPrivateKey,
      });
    });

    it("should create signer for mainnet", () => {
      // Arrange
      const mockMainnetClient = {
        network: "mainnet",
        setOperator: vi.fn(),
      } as any;
      vi.mocked(Client.forMainnet).mockReturnValue(mockMainnetClient);
      const network = "hedera-mainnet";
      const privateKeyString = "302e020100300506032b657004220420...";
      const accountId = "0.0.789012";

      // Act
      const result = createHederaSigner(network, privateKeyString, accountId);

      // Assert
      expect(Client.forMainnet).toHaveBeenCalledOnce();
      expect(AccountId.fromString).toHaveBeenCalledWith(accountId);
      expect(PrivateKey.fromStringECDSA).toHaveBeenCalledWith(privateKeyString);
      expect(mockMainnetClient.setOperator).toHaveBeenCalledWith(mockAccountId, mockPrivateKey);

      expect(result).toEqual({
        client: mockMainnetClient,
        accountId: mockAccountId,
        privateKey: mockPrivateKey,
      });
    });

    it("should handle invalid private key format", () => {
      // Arrange
      const network = "hedera-testnet";
      const invalidPrivateKey = "invalid-key";
      const accountId = "0.0.123456";
      vi.mocked(PrivateKey.fromStringECDSA).mockImplementation(() => {
        throw new Error("Invalid private key format");
      });

      // Act & Assert
      expect(() => createHederaSigner(network, invalidPrivateKey, accountId)).toThrow(
        "Invalid private key format"
      );
    });

    it("should handle invalid account ID format", () => {
      // Arrange
      const network = "hedera-testnet";
      const privateKeyString = "302e020100300506032b657004220420...";
      const invalidAccountId = "invalid-account";
      vi.mocked(AccountId.fromString).mockImplementation(() => {
        throw new Error("Invalid account ID format");
      });

      // Act & Assert
      expect(() => createHederaSigner(network, privateKeyString, invalidAccountId)).toThrow(
        "Invalid account ID format"
      );
    });

    it("should handle unsupported network", () => {
      // Arrange
      const network = "unsupported-network";
      const privateKeyString = "302e020100300506032b657004220420...";
      const accountId = "0.0.123456";

      // Act & Assert
      expect(() => createHederaSigner(network, privateKeyString, accountId)).toThrow(
        "Unsupported Hedera network: unsupported-network"
      );
    });

    it("should handle empty private key", () => {
      // Arrange
      const network = "hedera-testnet";
      const emptyPrivateKey = "";
      const accountId = "0.0.123456";
      vi.mocked(PrivateKey.fromStringECDSA).mockImplementation(() => {
        throw new Error("Empty private key");
      });

      // Act & Assert
      expect(() => createHederaSigner(network, emptyPrivateKey, accountId)).toThrow("Empty private key");
    });

    it("should handle empty account ID", () => {
      // Arrange
      const network = "hedera-testnet";
      const privateKeyString = "302e020100300506032b657004220420...";
      const emptyAccountId = "";
      vi.mocked(AccountId.fromString).mockImplementation(() => {
        throw new Error("Empty account ID");
      });

      // Act & Assert
      expect(() => createHederaSigner(network, privateKeyString, emptyAccountId)).toThrow("Empty account ID");
    });
  });

  describe("isHederaSigner", () => {
    it("should return true for valid Hedera signer", () => {
      // Arrange
      const validSigner: HederaSigner = {
        client: {} as any,
        accountId: {} as any,
        privateKey: {} as any,
      };

      // Act
      const result = isHederaSigner(validSigner);

      // Assert
      expect(result).toBe(true);
    });

    it("should return false for null", () => {
      // Act
      const result = isHederaSigner(null);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for undefined", () => {
      // Act
      const result = isHederaSigner(undefined);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for empty object", () => {
      // Act
      const result = isHederaSigner({});

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for object missing client", () => {
      // Arrange
      const invalidSigner = {
        accountId: {} as any,
        privateKey: {} as any,
      };

      // Act
      const result = isHederaSigner(invalidSigner);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for object missing accountId", () => {
      // Arrange
      const invalidSigner = {
        client: {} as any,
        privateKey: {} as any,
      };

      // Act
      const result = isHederaSigner(invalidSigner);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for object missing privateKey", () => {
      // Arrange
      const invalidSigner = {
        client: {} as any,
        accountId: {} as any,
      };

      // Act
      const result = isHederaSigner(invalidSigner);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for object with undefined client", () => {
      // Arrange
      const invalidSigner = {
        client: undefined,
        accountId: {} as any,
        privateKey: {} as any,
      };

      // Act
      const result = isHederaSigner(invalidSigner);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for object with undefined accountId", () => {
      // Arrange
      const invalidSigner = {
        client: {} as any,
        accountId: undefined,
        privateKey: {} as any,
      };

      // Act
      const result = isHederaSigner(invalidSigner);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for object with undefined privateKey", () => {
      // Arrange
      const invalidSigner = {
        client: {} as any,
        accountId: {} as any,
        privateKey: undefined,
      };

      // Act
      const result = isHederaSigner(invalidSigner);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for primitive types", () => {
      // Act & Assert
      expect(isHederaSigner("string")).toBe(false);
      expect(isHederaSigner(123)).toBe(false);
      expect(isHederaSigner(true)).toBe(false);
      expect(isHederaSigner([])).toBe(false);
    });
  });
});
