import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactSvmSchemeV1 } from "../../../src/exact/v1/facilitator/scheme";
import type { FacilitatorSvmSigner } from "../../../src/signer";
import type { PaymentRequirementsV1 } from "@x402/core/types/v1";
import type { PaymentPayloadV1 } from "@x402/core/types/v1";
import { USDC_DEVNET_ADDRESS } from "../../../src/constants";

describe("ExactSvmSchemeV1", () => {
  let mockSigner: FacilitatorSvmSigner;

  beforeEach(() => {
    mockSigner = {
      address: "FacilitatorAddress1111111111111111111" as never,
      getAddresses: vi
        .fn()
        .mockReturnValue([
          "FeePayer1111111111111111111111111111",
          "FacilitatorAddress1111111111111111111",
        ]) as never,
      signTransactions: vi.fn() as never,
      signMessages: vi.fn().mockResolvedValue([
        {
          // Mock signature dictionary
          FacilitatorAddress1111111111111111111: new Uint8Array(64),
        },
      ]) as never,
      getRpcForNetwork: vi.fn().mockReturnValue({
        getBalance: vi.fn().mockResolvedValue(BigInt(10000000)),
        getLatestBlockhash: vi.fn().mockResolvedValue({
          value: {
            blockhash: "mockBlockhash",
            lastValidBlockHeight: BigInt(100000),
          },
        }),
        simulateTransaction: vi.fn().mockResolvedValue({
          value: { err: null },
        }),
        sendTransaction: vi.fn().mockResolvedValue("mockSignature123"),
        getSignatureStatuses: vi.fn().mockResolvedValue({
          value: [{ confirmationStatus: "confirmed" }],
        }),
      }) as never,
    };
  });

  describe("constructor", () => {
    it("should create instance with correct scheme", () => {
      const facilitator = new ExactSvmSchemeV1(mockSigner);
      expect(facilitator.scheme).toBe("exact");
    });
  });

  describe("verify", () => {
    it("should reject if scheme does not match", async () => {
      const facilitator = new ExactSvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "wrong",
        network: "solana-devnet",
        payload: {
          transaction: "base64transaction==",
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "solana-devnet",
        asset: USDC_DEVNET_ADDRESS,
        maxAmountRequired: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: {
          feePayer: "FeePayer1111111111111111111111111111",
        },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("should reject if network does not match", async () => {
      const facilitator = new ExactSvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "solana-mainnet", // Wrong network
        payload: {
          transaction: "validbase64transaction==",
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "solana-devnet",
        asset: USDC_DEVNET_ADDRESS,
        maxAmountRequired: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: {
          feePayer: "FeePayer1111111111111111111111111111",
        },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      // Network check happens early in Step 1 (before transaction parsing)
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("network_mismatch");
    });

    it("should reject if feePayer is missing", async () => {
      const facilitator = new ExactSvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "solana-devnet",
        payload: {
          transaction: "base64transaction==",
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "solana-devnet",
        asset: USDC_DEVNET_ADDRESS,
        maxAmountRequired: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: {}, // Missing feePayer
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_svm_payload_missing_fee_payer");
    });

    it("should reject if transaction cannot be decoded", async () => {
      const facilitator = new ExactSvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "solana-devnet",
        payload: {
          transaction: "invalid!!!", // Invalid base64
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "solana-devnet",
        asset: USDC_DEVNET_ADDRESS,
        maxAmountRequired: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: {
          feePayer: "FeePayer1111111111111111111111111111",
        },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      // Transaction decoding or instruction parsing fails
      expect(result.invalidReason).toContain("invalid_exact_svm_payload_transaction");
    });
  });

  describe("settle", () => {
    it("should fail settlement if verification fails", async () => {
      const facilitator = new ExactSvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "wrong",
        network: "solana-devnet",
        payload: {
          transaction: "base64transaction==",
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "solana-devnet",
        asset: USDC_DEVNET_ADDRESS,
        maxAmountRequired: "100000",
        payTo: "PayToAddress11111111111111111111111111",
        maxTimeoutSeconds: 3600,
        extra: {
          feePayer: "FeePayer1111111111111111111111111111",
        },
      };

      const result = await facilitator.settle(payload as never, requirements as never);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("unsupported_scheme");
      expect(result.network).toBe("solana-devnet");
    });
  });
});
