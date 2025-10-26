/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeAll, describe, expect, it, vi, beforeEach } from "vitest";
import { AccountId, TokenId, PrivateKey, Transaction, TransferTransaction, Hbar, TransactionId } from "@hashgraph/sdk";
import { HederaSigner } from "../../../shared/hedera";
import { PaymentRequirements } from "../../../types/verify";
import { createAndSignPayment, createPaymentHeader } from "./client";
import { encodePayment } from "../evm/utils/paymentUtils";

// Mock Hedera SDK
vi.mock("@hashgraph/sdk", () => ({
  AccountId: {
    fromString: vi.fn(),
    generate: vi.fn(),
  },
  TokenId: {
    fromString: vi.fn(),
  },
  PrivateKey: {
    generate: vi.fn(),
    fromStringECDSA: vi.fn(),
  },
  TransactionId: {
    generate: vi.fn(),
  },
  Hbar: {
    fromTinybars: vi.fn(),
  },
  TransferTransaction: vi.fn().mockImplementation(() => ({
    setTransactionId: vi.fn().mockReturnThis(),
    addHbarTransfer: vi.fn().mockReturnThis(),
    addTokenTransfer: vi.fn().mockReturnThis(),
    freezeWith: vi.fn().mockReturnValue({
      sign: vi.fn().mockResolvedValue({
        toBytes: vi.fn().mockReturnValue(Buffer.from("mock_transaction_bytes")),
      }),
    }),
  })),
}));

// Mock shared utilities
vi.mock("../../../shared/hedera", () => ({
  serializeTransaction: vi.fn().mockReturnValue("base64_encoded_transaction"),
}));

vi.mock("../evm/utils/paymentUtils", () => ({
  encodePayment: vi.fn().mockReturnValue("encoded_payment_header"),
}));

describe("Hedera Client", () => {
  let clientSigner: HederaSigner;
  let tokenPaymentRequirements: PaymentRequirements;
  let hbarPaymentRequirements: PaymentRequirements;
  const mockAccountId = "0.0.123456";
  const mockTokenId = "0.0.429274";
  const mockFeePayer = "0.0.999999";
  const mockPayTo = "0.0.789012";

  beforeAll(async () => {
    // Mock client signer
    clientSigner = {
      client: {} as any,
      accountId: AccountId.fromString(mockAccountId),
      privateKey: PrivateKey.generate(),
    } as HederaSigner;

    // Token payment requirements
    tokenPaymentRequirements = {
      scheme: "exact",
      network: "hedera-testnet",
      payTo: mockPayTo as any,
      asset: mockTokenId,
      maxAmountRequired: "1000000", // 1 token (6 decimals)
      resource: "http://example.com/resource",
      description: "Test token payment",
      mimeType: "text/plain",
      maxTimeoutSeconds: 60,
      extra: {
        feePayer: mockFeePayer,
      },
    };

    // HBAR payment requirements
    hbarPaymentRequirements = {
      scheme: "exact",
      network: "hedera-testnet",
      payTo: mockPayTo as any,
      asset: "hbar", // HBAR asset
      maxAmountRequired: "50000000", // 0.5 HBAR (8 decimals)
      resource: "http://example.com/resource",
      description: "Test HBAR payment",
      mimeType: "text/plain",
      maxTimeoutSeconds: 60,
      extra: {
        feePayer: mockFeePayer,
      },
    };
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset TransferTransaction mock to default implementation
    vi.mocked(TransferTransaction).mockImplementation(() => ({
      setTransactionId: vi.fn().mockReturnThis(),
      addHbarTransfer: vi.fn().mockReturnThis(),
      addTokenTransfer: vi.fn().mockReturnThis(),
      freezeWith: vi.fn().mockReturnValue({
        sign: vi.fn().mockResolvedValue({
          toBytes: vi.fn().mockReturnValue(Buffer.from("mock_transaction_bytes")),
        }),
      }),
    }));

    // Reset serializeTransaction mock to default implementation
    const { serializeTransaction } = await import("../../../shared/hedera");
    vi.mocked(serializeTransaction).mockReturnValue("base64_encoded_transaction");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createAndSignPayment", () => {
    it("should create and sign a token transfer payment", async () => {
      // Arrange
      const mockTransaction = {
        sign: vi.fn().mockResolvedValue("signed_transaction"),
        toBytes: vi.fn().mockReturnValue(Buffer.from("mock_transaction_bytes")),
      };

      // Mock the createTransferTransaction function by spying on the module
      const { createAndSignPayment } = await import("./client");

      // Act
      const result = await createAndSignPayment(clientSigner, 1, tokenPaymentRequirements);

      // Assert
      expect(result).toBeDefined();
      expect(result.scheme).toBe("exact");
      expect(result.network).toBe("hedera-testnet");
      expect(result.x402Version).toBe(1);
      expect(result.payload).toBeDefined();
      expect(result.payload.transaction).toBe("base64_encoded_transaction");
    });

    it("should create and sign an HBAR transfer payment", async () => {
      // Act
      const result = await createAndSignPayment(clientSigner, 1, hbarPaymentRequirements);

      // Assert
      expect(result).toBeDefined();
      expect(result.scheme).toBe("exact");
      expect(result.network).toBe("hedera-testnet");
      expect(result.x402Version).toBe(1);
      expect(result.payload).toBeDefined();
      expect(result.payload.transaction).toBe("base64_encoded_transaction");
    });

    it("should handle missing fee payer", async () => {
      // Arrange
      const noFeePayerRequirements = {
        ...tokenPaymentRequirements,
        extra: {},
      };

      // Act & Assert
      await expect(
        createAndSignPayment(clientSigner, 1, noFeePayerRequirements)
      ).rejects.toThrow("feePayer is required in paymentRequirements.extra");
    });

    it("should handle invalid account ID format", async () => {
      // Arrange
      const invalidAccountRequirements = {
        ...tokenPaymentRequirements,
        payTo: "invalid-account-id" as any,
      };

      // Mock AccountId.fromString to throw an error
      vi.mocked(AccountId.fromString).mockImplementation((id: string) => {
        if (id === "invalid-account-id") {
          throw new Error("Invalid account ID format");
        }
        return {} as AccountId;
      });

      // Act & Assert
      await expect(
        createAndSignPayment(clientSigner, 1, invalidAccountRequirements)
      ).rejects.toThrow("Invalid account ID format");
    });

    it("should handle invalid token ID format", async () => {
      // Arrange
      const invalidTokenRequirements = {
        ...tokenPaymentRequirements,
        asset: "invalid-token-id",
      };

      // Mock TokenId.fromString to throw an error
      vi.mocked(TokenId.fromString).mockImplementation((id: string) => {
        if (id === "invalid-token-id") {
          throw new Error("Invalid token ID format");
        }
        return {} as TokenId;
      });

      // Act & Assert
      await expect(
        createAndSignPayment(clientSigner, 1, invalidTokenRequirements)
      ).rejects.toThrow("Invalid token ID format");
    });
  });

  describe("createPaymentHeader", () => {
    it("should create payment header for token transfer", async () => {
      // Act
      const header = await createPaymentHeader(clientSigner, 1, tokenPaymentRequirements);

      // Assert
      expect(header).toBeDefined();
      expect(typeof header).toBe("string");
      expect(header).toBe("encoded_payment_header");
    });

    it("should create payment header for HBAR transfer", async () => {
      // Act
      const header = await createPaymentHeader(clientSigner, 1, hbarPaymentRequirements);

      // Assert
      expect(header).toBeDefined();
      expect(typeof header).toBe("string");
      expect(header).toBe("encoded_payment_header");
    });

    it("should handle errors from createAndSignPayment", async () => {
      // Arrange
      const invalidRequirements = {
        ...tokenPaymentRequirements,
        extra: {},
      };

      // Act & Assert
      await expect(
        createPaymentHeader(clientSigner, 1, invalidRequirements)
      ).rejects.toThrow("feePayer is required in paymentRequirements.extra");
    });
  });

  describe("HBAR vs Token Detection", () => {
    it("should correctly identify HBAR assets", async () => {
      // Test with "hbar" (lowercase)
      const result1 = await createAndSignPayment(clientSigner, 1, hbarPaymentRequirements);
      expect(result1).toBeDefined();

      // Test with "HBAR" (uppercase)
      const hbarUpperRequirements = {
        ...hbarPaymentRequirements,
        asset: "HBAR",
      };
      const result2 = await createAndSignPayment(clientSigner, 1, hbarUpperRequirements);
      expect(result2).toBeDefined();

      // Test with "0.0.0" (special HBAR address)
      const hbarZeroRequirements = {
        ...hbarPaymentRequirements,
        asset: "0.0.0",
      };
      const result3 = await createAndSignPayment(clientSigner, 1, hbarZeroRequirements);
      expect(result3).toBeDefined();
    });

    it("should correctly identify token assets", async () => {
      // Test with token ID
      const result = await createAndSignPayment(clientSigner, 1, tokenPaymentRequirements);
      expect(result).toBeDefined();
    });
  });

  describe("Transaction Creation", () => {
    it("should create HBAR transfer transaction with correct parameters", async () => {
      // Act
      await createAndSignPayment(clientSigner, 1, hbarPaymentRequirements);

      // Assert
      expect(TransferTransaction).toHaveBeenCalled();
      expect(TransactionId.generate).toHaveBeenCalledWith(AccountId.fromString(mockFeePayer));
    });

    it("should create token transfer transaction with correct parameters", async () => {
      // Act
      await createAndSignPayment(clientSigner, 1, tokenPaymentRequirements);

      // Assert
      expect(TransferTransaction).toHaveBeenCalled();
      expect(TokenId.fromString).toHaveBeenCalledWith(mockTokenId);
      expect(TransactionId.generate).toHaveBeenCalledWith(AccountId.fromString(mockFeePayer));
    });
  });

  describe("Error Handling", () => {
    it("should handle transaction signing errors", async () => {
      // Arrange - Mock the TransferTransaction to return a transaction that throws on sign
      vi.mocked(TransferTransaction).mockImplementation(() => ({
        setTransactionId: vi.fn().mockReturnThis(),
        addHbarTransfer: vi.fn().mockReturnThis(),
        addTokenTransfer: vi.fn().mockReturnThis(),
        freezeWith: vi.fn().mockReturnValue({
          sign: vi.fn().mockRejectedValue(new Error("Signing failed")),
        }),
      }));

      // Act & Assert
      await expect(
        createAndSignPayment(clientSigner, 1, tokenPaymentRequirements)
      ).rejects.toThrow("Signing failed");
    });

    it("should handle serialization errors", async () => {
      // Arrange - Mock the serializeTransaction function to throw an error
      const { serializeTransaction } = await import("../../../shared/hedera");
      vi.mocked(serializeTransaction).mockImplementation(() => {
        throw new Error("Serialization failed");
      });

      // Act & Assert
      await expect(
        createAndSignPayment(clientSigner, 1, tokenPaymentRequirements)
      ).rejects.toThrow("Serialization failed");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete payment flow for token transfer", async () => {
      // Act
      const payment = await createAndSignPayment(clientSigner, 1, tokenPaymentRequirements);
      const header = await createPaymentHeader(clientSigner, 1, tokenPaymentRequirements);

      // Assert
      expect(payment).toBeDefined();
      expect(header).toBeDefined();
      expect(payment.scheme).toBe("exact");
      expect(payment.network).toBe("hedera-testnet");
    });

    it("should handle complete payment flow for HBAR transfer", async () => {
      // Act
      const payment = await createAndSignPayment(clientSigner, 1, hbarPaymentRequirements);
      const header = await createPaymentHeader(clientSigner, 1, hbarPaymentRequirements);

      // Assert
      expect(payment).toBeDefined();
      expect(header).toBeDefined();
      expect(payment.scheme).toBe("exact");
      expect(payment.network).toBe("hedera-testnet");
    });
  });
});
