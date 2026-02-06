import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactXrpScheme, ExactXrpSchemeConfig } from "../../../src/exact/facilitator/scheme";
import { toFacilitatorXrpSigner } from "../../../src/signer";
import { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ExactXrpPayloadV2 } from "../../../src/types";

describe("ExactXrpScheme Facilitator", () => {
  let scheme: ExactXrpScheme;
  let mockClient: any;
  let mockSigner: any;

  beforeEach(() => {
    mockClient = {
      submit: vi.fn(),
      getBalances: vi.fn(),
      getAccountInfo: vi.fn(),
      disconnect: vi.fn(),
    };

    mockSigner = toFacilitatorXrpSigner(mockClient);
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
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.getBalances.mockResolvedValue([{ currency: "XRP", value: "100" }]);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject payload with insufficient balance", async () => {
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
            Amount: "100000000000", // 100,000 XRP
            Fee: "12",
            Sequence: 1,
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.getBalances.mockResolvedValue([{ currency: "XRP", value: "10" }]);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Insufficient balance");
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
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.getBalances.mockResolvedValue([{ currency: "XRP", value: "100" }]);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Amount mismatch");
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
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.getBalances.mockResolvedValue([{ currency: "XRP", value: "100" }]);

      const result = await scheme.verify(mockPayload, mockRequirements);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Destination mismatch");
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
      expect(result.error).toContain("Invalid XRP payload");
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
            DestinationTag: 12345,
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.getBalances.mockResolvedValue([{ currency: "XRP", value: "100" }]);

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
            DestinationTag: 99999, // Wrong tag
          },
        } as ExactXrpPayloadV2,
      };

      const result = await scheme.verify(mockPayload, requirementsWithTag);

      expect(result.isValid).toBe(false);
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
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.submit.mockResolvedValue({
        result: {
          engine_result: "tesSUCCESS",
          tx_json: {
            hash: "ABC123HASH",
          },
        },
      });

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("ABC123HASH");
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
          },
        } as ExactXrpPayloadV2,
      };

      mockClient.submit.mockResolvedValue({
        result: {
          engine_result: "tecNO_DST",
          engine_result_message: "Destination does not exist",
        },
      });

      const result = await scheme.settle(mockPayload, mockRequirements);

      expect(result.success).toBe(false);
      expect(result.error).toContain("tecNO_DST");
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
    });
  });

  describe("getNetwork", () => {
    it("should derive network from CAIP-2 identifier", () => {
      expect(scheme.getNetwork("xrp:mainnet")).toBe("mainnet");
      expect(scheme.getNetwork("xrp:testnet")).toBe("testnet");
      expect(scheme.getNetwork("xrp:devnet")).toBe("devnet");
    });

    it("should return undefined for non-XRP networks", () => {
      expect(scheme.getNetwork("eip155:1")).toBeUndefined();
      expect(scheme.getNetwork("solana:mainnet")).toBeUndefined();
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
  });
});
