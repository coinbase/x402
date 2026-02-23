import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactXrpScheme, ExactXrpSchemeConfig } from "../../../src/exact/facilitator/scheme";
import { FacilitatorXrpClient } from "../../../src/signer";
import { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactXrpPayloadV2 } from "../../../src/types";

describe("ExactXrpScheme Facilitator", () => {
  let scheme: ExactXrpScheme;
  let mockSigner: FacilitatorXrpSigner;

  beforeEach(() => {
    // Create a mock signer that matches the FacilitatorXrpSigner interface
    mockSigner = {
      getAddresses: vi.fn().mockReturnValue(["rFacilitatorAddress123456789"]),
      submitTransaction: vi.fn(),
      waitForValidation: vi.fn(),
      verifySignature: vi.fn(),
      getAccountInfo: vi.fn(),
      getLedgerIndex: vi.fn(),
      getFee: vi.fn(),
    };

    scheme = new ExactXrpScheme(mockSigner);
  });

  describe("properties", () => {
    it("should return exact scheme", () => {
      expect(scheme.scheme).toBe("exact");
    });

    it("should return xrp CAIP family", () => {
      expect(scheme.caipFamily).toBe("xrp:*");
    });
  });

  describe("getExtra", () => {
    it("should return undefined for XRP (no extra data needed)", () => {
      expect(scheme.getExtra("xrp:testnet")).toBeUndefined();
    });

    it("should return undefined for any network", () => {
      expect(scheme.getExtra("xrp:mainnet")).toBeUndefined();
      expect(scheme.getExtra("xrp:devnet")).toBeUndefined();
    });
  });

  describe("getSigners", () => {
    it("should return facilitator addresses", () => {
      const addresses = scheme.getSigners("xrp:testnet");
      expect(addresses).toContain("rFacilitatorAddress123456789");
    });

    it("should return empty array if no addresses added", () => {
      const emptySigner = {
        ...mockSigner,
        getAddresses: vi.fn().mockReturnValue([]),
      };
      const emptyScheme = new ExactXrpScheme(emptySigner);
      expect(emptyScheme.getSigners("xrp:testnet")).toEqual([]);
    });
  });

  describe("verify", () => {
    const mockRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "xrp:testnet",
      amount: "10000",
      asset: "XRP",
      payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
    };

    it("should verify valid payment payload", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000228000000024000000016140000000000027108114...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
            SigningPubKey: "02...",
            TxnSignature: "30...",
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);
      mockSigner.getLedgerIndex.mockResolvedValue(950); // Close to LastLedgerSequence
      mockSigner.getAccountInfo.mockResolvedValue({
        balance: "20000000", // 20 XRP (enough for 0.01 XRP payment + 1 XRP reserve)
        sequence: 1,
        ownerCount: 0,
      });

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
    });

    it("should reject payload with invalid signature", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(false);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("INVALID_SIGNATURE");
    });

    it("should reject payload with insufficient balance", async () => {
      // Use a small amount in requirements to pass amount check, but low balance
      const smallRequirements: PaymentRequirements = {
        ...mockRequirements,
        amount: "10000", // Small amount that matches the transaction
      };

      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: smallRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000", // Matches requirements
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);
      mockSigner.getLedgerIndex.mockResolvedValue(500);
      mockSigner.getAccountInfo.mockResolvedValue({
        balance: "1000000", // 1 XRP (only reserve, no spendable balance)
        sequence: 1,
        ownerCount: 0,
      });

      const result = await scheme.verify(mockPayload, smallRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("INSUFFICIENT_BALANCE");
    });

    it("should reject payload with incorrect amount", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "5000", // Wrong amount
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("AMOUNT_MISMATCH");
    });

    it("should reject payload with incorrect destination", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rWrongDestinationAddressHere11111",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("DESTINATION_MISMATCH");
    });

    it("should reject non-XRP payload", async () => {
      const mockPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signature: "0x1234...",
          authorization: {},
        },
      } as unknown as PaymentPayload;

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("INVALID_TRANSACTION");
    });

    it("should verify with destination tag match", async () => {
      const requirementsWithTag: PaymentRequirements = {
        ...mockRequirements,
        extra: { destinationTag: 12345 },
      };

      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: requirementsWithTag,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
            DestinationTag: 12345,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);
      mockSigner.getLedgerIndex.mockResolvedValue(950);
      mockSigner.getAccountInfo.mockResolvedValue({
        balance: "20000000", // 20 XRP (enough balance)
        sequence: 1,
        ownerCount: 0,
      });

      const result = await scheme.verify(mockPayload, requirementsWithTag);

      expect(result.isValid).toBe(true);
    });

    it("should reject mismatched destination tag", async () => {
      const requirementsWithTag: PaymentRequirements = {
        ...mockRequirements,
        extra: { destinationTag: 12345 },
      };

      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: requirementsWithTag,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
            DestinationTag: 99999, // Wrong tag
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);

      const result = await scheme.verify(mockPayload, requirementsWithTag);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("DESTINATION_TAG_MISMATCH");
    });

    it("should reject expired transaction", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 100, // Expired
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);
      mockSigner.getAccountInfo.mockResolvedValue({
        balance: "100000000",
        sequence: 1,
        ownerCount: 0,
      });
      mockSigner.getLedgerIndex.mockResolvedValue(500); // Current ledger is past expiry

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("EXPIRED");
    });

    it("should reject fee too high", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "20000", // Too high (exceeds 0.01 XRP max)
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("FEE_TOO_HIGH");
    });

    it("should reject invalid sequence", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 100, // Too far ahead
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);
      mockSigner.getAccountInfo.mockResolvedValue({
        balance: "100000000",
        sequence: 1,
        ownerCount: 0,
      });
      mockSigner.getLedgerIndex.mockResolvedValue(500);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("SEQUENCE_INVALID");
    });

    it("should reject non-Payment transaction type", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "OfferCreate", // Wrong type
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as unknown as ExactXrpPayloadV2,
      };

      mockSigner.verifySignature.mockResolvedValue(true);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("INVALID_TRANSACTION");
    });
  });

  describe("settle", () => {
    const mockRequirements: PaymentRequirements = {
      scheme: "exact",
      network: "xrp:testnet",
      amount: "10000",
      asset: "XRP",
      payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
    };

    it("should settle valid payment", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.submitTransaction.mockResolvedValue({
        hash: "ABC123HASH",
      });
      mockSigner.waitForValidation.mockResolvedValue({
        validated: true,
        result: "tesSUCCESS",
      });

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("ABC123HASH");
      expect(result.payer).toBe("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
      expect(result.network).toBe("xrp:testnet");
    });

    it("should handle submission failure", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.submitTransaction.mockRejectedValue(new Error("Submit failed"));

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("SUBMIT_FAILED");
      expect(result.transaction).toBe("");
    });

    it("should handle known failure result codes", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.submitTransaction.mockResolvedValue({
        hash: "ABC123HASH",
      });
      mockSigner.waitForValidation.mockResolvedValue({
        validated: true,
        result: "tecNO_DST", // Destination doesn't exist
      });

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("tecNO_DST");
      expect(result.transaction).toBe("ABC123HASH");
    });

    it("should handle timeout waiting for validation", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.submitTransaction.mockResolvedValue({
        hash: "ABC123HASH",
      });
      mockSigner.waitForValidation.mockResolvedValue({
        validated: false,
        result: "timeout",
      });

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("TIMEOUT");
      expect(result.transaction).toBe("ABC123HASH");
    });

    it("should reject invalid XRP payload", async () => {
      const invalidPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signature: "0x1234", // Not XRP format
        },
      } as unknown as PaymentPayload;

      const result = await scheme.settle(invalidPayload, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("INVALID_TRANSACTION");
    });

    it("should handle unknown result codes", async () => {
      const mockPayload: PaymentPayload = {
        x402Version: 2,
        resource: { url: "https://test.com" },
        accepted: mockRequirements,
        payload: {
          signedTransaction: "120000...",
          transaction: {
            TransactionType: "Payment",
            Account: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
            Destination: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
            Amount: "10000",
            Fee: "12",
            Sequence: 1,
            LastLedgerSequence: 1000,
          },
        } as ExactXrpPayloadV2,
      };

      mockSigner.submitTransaction.mockResolvedValue({
        hash: "ABC123HASH",
      });
      mockSigner.waitForValidation.mockResolvedValue({
        validated: true,
        result: "terUNKNOWN", // Unknown result code
      });

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("UNKNOWN_RESULT");
      expect(result.transaction).toBe("ABC123HASH");
    });
  });

  describe("configuration", () => {
    it("should accept autoFundDestinations config", () => {
      const config: ExactXrpSchemeConfig = {
        autoFundDestinations: true,
        newAccountFundingXrp: 2,
      };

      const configuredScheme = new ExactXrpScheme(mockSigner, config);
      expect(configuredScheme).toBeDefined();
    });

    it("should work with default config", () => {
      const defaultScheme = new ExactXrpScheme(mockSigner);
      expect(defaultScheme).toBeDefined();
    });

    it("should accept empty config object", () => {
      const emptyConfigScheme = new ExactXrpScheme(mockSigner, {});
      expect(emptyConfigScheme).toBeDefined();
    });
  });
});

// Type definition for mock signer to match interface
type FacilitatorXrpSigner = {
  getAddresses(): readonly string[];
  submitTransaction(signedTransaction: string): Promise<{ hash: string }>;
  waitForValidation(hash: string): Promise<{ validated: boolean; result: string; metadata?: unknown }>;
  verifySignature(transaction: ExactXrpPayloadV2["transaction"], signedBlob: string): Promise<boolean>;
  getAccountInfo(address: string): Promise<{
    balance: string;
    sequence: number;
    ownerCount: number;
  }>;
  getLedgerIndex(): Promise<number>;
  getFee(): Promise<string>;
};
