/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@hashgraph/sdk";
import { getHederaClient, getMirrorNodeUrl } from "./rpc";
import { createHederaConnectedClient } from "./wallet";

// Mock the wallet module
vi.mock("./wallet", () => ({
  createHederaConnectedClient: vi.fn(),
}));

describe("Hedera RPC Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getHederaClient", () => {
    it("should return client for testnet", () => {
      // Arrange
      const mockTestnetClient = { network: "testnet" } as any;
      vi.mocked(createHederaConnectedClient).mockReturnValue(mockTestnetClient);

      // Act
      const result = getHederaClient("hedera-testnet");

      // Assert
      expect(createHederaConnectedClient).toHaveBeenCalledWith("hedera-testnet");
      expect(result).toBe(mockTestnetClient);
    });

    it("should return client for mainnet", () => {
      // Arrange
      const mockMainnetClient = { network: "mainnet" } as any;
      vi.mocked(createHederaConnectedClient).mockReturnValue(mockMainnetClient);

      // Act
      const result = getHederaClient("hedera-mainnet");

      // Assert
      expect(createHederaConnectedClient).toHaveBeenCalledWith("hedera-mainnet");
      expect(result).toBe(mockMainnetClient);
    });

    it("should throw error for unsupported network", () => {
      // Arrange
      vi.mocked(createHederaConnectedClient).mockImplementation(() => {
        throw new Error("Unsupported Hedera network: unsupported-network");
      });

      // Act & Assert
      expect(() => getHederaClient("unsupported-network")).toThrow(
        "Unsupported Hedera network: unsupported-network"
      );
    });

    it("should throw error for empty network", () => {
      // Arrange
      vi.mocked(createHederaConnectedClient).mockImplementation(() => {
        throw new Error("Unsupported Hedera network: ");
      });

      // Act & Assert
      expect(() => getHederaClient("")).toThrow("Unsupported Hedera network: ");
    });

    it("should throw error for null network", () => {
      // Arrange
      vi.mocked(createHederaConnectedClient).mockImplementation(() => {
        throw new Error("Unsupported Hedera network: null");
      });

      // Act & Assert
      expect(() => getHederaClient(null as any)).toThrow("Unsupported Hedera network: null");
    });

    it("should handle case sensitivity", () => {
      // Arrange
      const mockClient = { network: "testnet" } as any;
      vi.mocked(createHederaConnectedClient).mockReturnValue(mockClient);

      // Act
      const result = getHederaClient("HEDERA-TESTNET");

      // Assert
      expect(createHederaConnectedClient).toHaveBeenCalledWith("HEDERA-TESTNET");
      expect(result).toBe(mockClient);
    });

    it("should handle whitespace in network name", () => {
      // Arrange
      const mockClient = { network: "mainnet" } as any;
      vi.mocked(createHederaConnectedClient).mockReturnValue(mockClient);

      // Act
      const result = getHederaClient(" hedera-mainnet ");

      // Assert
      expect(createHederaConnectedClient).toHaveBeenCalledWith(" hedera-mainnet ");
      expect(result).toBe(mockClient);
    });
  });

  describe("getMirrorNodeUrl", () => {
    it("should return testnet mirror URL", () => {
      // Act
      const result = getMirrorNodeUrl("hedera-testnet");

      // Assert
      expect(result).toBe("https://testnet.mirrornode.hedera.com");
    });

    it("should return mainnet mirror URL", () => {
      // Act
      const result = getMirrorNodeUrl("hedera-mainnet");

      // Assert
      expect(result).toBe("https://mainnet-public.mirrornode.hedera.com");
    });

    it("should throw error for unsupported network", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl("unsupported-network")).toThrow(
        "Unsupported Hedera network: unsupported-network"
      );
    });

    it("should throw error for empty network", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl("")).toThrow(
        "Unsupported Hedera network: "
      );
    });

    it("should throw error for null network", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl(null as any)).toThrow(
        "Unsupported Hedera network: null"
      );
    });

    it("should throw error for undefined network", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl(undefined as any)).toThrow(
        "Unsupported Hedera network: undefined"
      );
    });

    it("should handle case sensitivity", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl("HEDERA-TESTNET")).toThrow(
        "Unsupported Hedera network: HEDERA-TESTNET"
      );
      expect(() => getMirrorNodeUrl("HEDERA-MAINNET")).toThrow(
        "Unsupported Hedera network: HEDERA-MAINNET"
      );
    });

    it("should handle whitespace in network name", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl(" hedera-testnet ")).toThrow(
        "Unsupported Hedera network:  hedera-testnet "
      );
      expect(() => getMirrorNodeUrl(" hedera-mainnet ")).toThrow(
        "Unsupported Hedera network:  hedera-mainnet "
      );
    });

    it("should handle partial network names", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl("testnet")).toThrow(
        "Unsupported Hedera network: testnet"
      );
      expect(() => getMirrorNodeUrl("mainnet")).toThrow(
        "Unsupported Hedera network: mainnet"
      );
      expect(() => getMirrorNodeUrl("hedera")).toThrow(
        "Unsupported Hedera network: hedera"
      );
    });

    it("should handle numeric network names", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl("1")).toThrow(
        "Unsupported Hedera network: 1"
      );
      expect(() => getMirrorNodeUrl("0")).toThrow(
        "Unsupported Hedera network: 0"
      );
    });

    it("should handle special characters", () => {
      // Act & Assert
      expect(() => getMirrorNodeUrl("hedera-testnet!")).toThrow(
        "Unsupported Hedera network: hedera-testnet!"
      );
      expect(() => getMirrorNodeUrl("hedera-mainnet@")).toThrow(
        "Unsupported Hedera network: hedera-mainnet@"
      );
    });
  });

  describe("Integration Tests", () => {
    it("should work with both functions for testnet", () => {
      // Arrange
      const mockTestnetClient = { network: "testnet" } as any;
      vi.mocked(createHederaConnectedClient).mockReturnValue(mockTestnetClient);

      // Act
      const client = getHederaClient("hedera-testnet");
      const mirrorUrl = getMirrorNodeUrl("hedera-testnet");

      // Assert
      expect(client).toBe(mockTestnetClient);
      expect(mirrorUrl).toBe("https://testnet.mirrornode.hedera.com");
    });

    it("should work with both functions for mainnet", () => {
      // Arrange
      const mockMainnetClient = { network: "mainnet" } as any;
      vi.mocked(createHederaConnectedClient).mockReturnValue(mockMainnetClient);

      // Act
      const client = getHederaClient("hedera-mainnet");
      const mirrorUrl = getMirrorNodeUrl("hedera-mainnet");

      // Assert
      expect(client).toBe(mockMainnetClient);
      expect(mirrorUrl).toBe("https://mainnet-public.mirrornode.hedera.com");
    });

    it("should handle errors consistently", () => {
      // Arrange
      vi.mocked(createHederaConnectedClient).mockImplementation(() => {
        throw new Error("Unsupported Hedera network: invalid-network");
      });

      // Act & Assert
      expect(() => getHederaClient("invalid-network")).toThrow(
        "Unsupported Hedera network: invalid-network"
      );
      expect(() => getMirrorNodeUrl("invalid-network")).toThrow(
        "Unsupported Hedera network: invalid-network"
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long network names", () => {
      // Arrange
      const longNetworkName = "a".repeat(1000);

      // Act & Assert
      expect(() => getMirrorNodeUrl(longNetworkName)).toThrow(
        `Unsupported Hedera network: ${longNetworkName}`
      );
    });

    it("should handle network names with unicode characters", () => {
      // Arrange
      const unicodeNetworkName = "hedera-testnet-🚀";

      // Act & Assert
      expect(() => getMirrorNodeUrl(unicodeNetworkName)).toThrow(
        `Unsupported Hedera network: ${unicodeNetworkName}`
      );
    });

    it("should handle network names with newlines", () => {
      // Arrange
      const networkWithNewlines = "hedera-testnet\n";

      // Act & Assert
      expect(() => getMirrorNodeUrl(networkWithNewlines)).toThrow(
        `Unsupported Hedera network: ${networkWithNewlines}`
      );
    });
  });
});
