import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExactEvmSchemeV1 } from "../../../src/exact/v1/facilitator/scheme";
import type { FacilitatorEvmSigner } from "../../../src/signer";
import type { PaymentRequirementsV1 } from "@x402/core/types/v1";
import type { PaymentPayloadV1 } from "@x402/core/types/v1";

describe("ExactEvmSchemeV1", () => {
  let mockSigner: FacilitatorEvmSigner;

  beforeEach(() => {
    mockSigner = {
      getAddresses: vi.fn().mockReturnValue(["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"]),
      readContract: vi.fn().mockResolvedValue(BigInt("10000000")), // 10 USDC
      verifyTypedData: vi.fn().mockResolvedValue(true),
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
      sendTransaction: vi.fn().mockResolvedValue("0xtxhash"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      getCode: vi.fn().mockResolvedValue("0x"),
    };
  });

  describe("constructor", () => {
    it("should create instance with correct scheme", () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);
      expect(facilitator.scheme).toBe("exact");
    });
  });

  describe("verify", () => {
    it("should verify valid V1 payment payload", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xvalidsignature",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: {
          name: "USDC",
          version: "2",
        },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
    });

    it("should reject if scheme does not match", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "wrong",
        network: "base-sepolia",
        payload: {
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: "0",
            validBefore: "999999999999",
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: {},
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("should reject if network does not match", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "ethereum",
        payload: {
          signature: "0xsig",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("network_mismatch");
    });

    it("should reject if amount is insufficient (maxAmountRequired)", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xsig",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "50000", // Less than required
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_evm_payload_authorization_value");
    });

    it("should reject if balance is insufficient", async () => {
      mockSigner.readContract = vi.fn().mockResolvedValue(BigInt("50000")); // Low balance

      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xsig",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("insufficient_funds");
    });

    it("should reject if recipient does not match", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xsig",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x0000000000000000000000000000000000000000", // Wrong recipient
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_evm_payload_recipient_mismatch");
    });

    it("should reject if network not supported", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "unknown-network",
        payload: {
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: "0",
            validBefore: "999999999999",
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "unknown-network",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: {},
      };

      const result = await facilitator.verify(payload as never, requirements as never);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_network");
    });
  });

  describe("settle", () => {
    it("should settle valid V1 payment", async () => {
      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xvalidsignature",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: {
          name: "USDC",
          version: "2",
        },
      };

      const result = await facilitator.settle(payload as never, requirements as never);

      expect(result.success).toBe(true);
      expect(result.network).toBe("base-sepolia");
      expect(result.transaction).toBe("0xtxhash");
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
    });

    it("should fail settlement if verification fails", async () => {
      mockSigner.verifyTypedData = vi.fn().mockResolvedValue(false);

      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
        payload: {
          signature: "0xinvalid",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x00",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "base-sepolia",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      const result = await facilitator.settle(payload as never, requirements as never);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("invalid_exact_evm_payload_signature");
    });
  });

  describe("network-specific timeout configuration", () => {
    it("should use default timeout for Base networks", async () => {
      const timeoutCapture = vi.fn().mockImplementation(({ hash: _hash, timeout }) => {
        expect(timeout).toBe(60000); // Base should get 60s timeout
        return Promise.resolve({ status: "success" });
      });
      mockSigner.waitForTransactionReceipt = timeoutCapture;

      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453", // Base mainnet
        payload: {
          signature:
            "0xvalidsignature123456789012345678901234567890123456789012345678901234567890abcdef123456789012345678901234567890123456789012345678901234",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      await facilitator.settle(payload as never, requirements as never);
    });

    it("should use default timeout for Ethereum networks", async () => {
      const timeoutCapture = vi.fn().mockImplementation(({ hash: _hash, timeout }) => {
        expect(timeout).toBe(30000); // Ethereum should get 30s timeout
        return Promise.resolve({ status: "success" });
      });
      mockSigner.waitForTransactionReceipt = timeoutCapture;

      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:1", // Ethereum mainnet
        payload: {
          signature:
            "0xvalidsignature123456789012345678901234567890123456789012345678901234567890abcdef123456789012345678901234567890123456789012345678901234",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "eip155:1",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      await facilitator.settle(payload as never, requirements as never);
    });

    it("should use fallback timeout for unknown networks", async () => {
      const timeoutCapture = vi.fn().mockImplementation(({ hash: _hash, timeout }) => {
        expect(timeout).toBe(15000); // Unknown network should get default 15s timeout
        return Promise.resolve({ status: "success" });
      });
      mockSigner.waitForTransactionReceipt = timeoutCapture;

      const facilitator = new ExactEvmSchemeV1(mockSigner);

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:9999", // Unknown network
        payload: {
          signature:
            "0xvalidsignature123456789012345678901234567890123456789012345678901234567890abcdef123456789012345678901234567890123456789012345678901234",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "eip155:9999",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      await facilitator.settle(payload as never, requirements as never);
    });

    it("should allow custom timeout configuration", async () => {
      const customTimeouts = {
        "eip155:8453": 120000, // Custom 2 minute timeout for Base
        "eip155:1": 45000, // Custom 45s timeout for Ethereum
      };

      const timeoutCapture = vi.fn().mockImplementation(({ hash: _hash, timeout }) => {
        expect(timeout).toBe(120000); // Should use custom Base timeout
        return Promise.resolve({ status: "success" });
      });
      mockSigner.waitForTransactionReceipt = timeoutCapture;

      const facilitator = new ExactEvmSchemeV1(mockSigner, {
        networkTimeouts: customTimeouts,
      });

      const payload: PaymentPayloadV1 = {
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453",
        payload: {
          signature:
            "0xvalidsignature123456789012345678901234567890123456789012345678901234567890abcdef123456789012345678901234567890123456789012345678901234",
          authorization: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0x9876543210987654321098765432109876543210",
            value: "100000",
            validAfter: (Math.floor(Date.now() / 1000) - 300).toString(),
            validBefore: (Math.floor(Date.now() / 1000) + 3600).toString(),
            nonce: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          },
        },
      };

      const requirements: PaymentRequirementsV1 = {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        maxAmountRequired: "100000",
        payTo: "0x9876543210987654321098765432109876543210",
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      };

      await facilitator.settle(payload as never, requirements as never);
    });
  });
});
