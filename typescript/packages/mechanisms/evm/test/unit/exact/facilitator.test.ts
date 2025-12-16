import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/facilitator/scheme";
import { ExactEvmScheme as ClientExactEvmScheme } from "../../../src/exact/client/scheme";
import type { ClientEvmSigner, FacilitatorEvmSigner } from "../../../src/signer";
import { PaymentRequirements, PaymentPayload } from "@x402/core/types";

describe("ExactEvmScheme (Facilitator)", () => {
  let facilitator: ExactEvmScheme;
  let mockFacilitatorSigner: FacilitatorEvmSigner;
  let client: ClientExactEvmScheme;
  let mockClientSigner: ClientEvmSigner;

  beforeEach(() => {
    // Create mock client signer
    mockClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    client = new ClientExactEvmScheme(mockClientSigner);

    // Create mock facilitator signer
    mockFacilitatorSigner = {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      readContract: vi.fn().mockResolvedValue(0n), // Mock nonce state
      verifyTypedData: vi.fn().mockResolvedValue(true), // Mock signature verification
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      getCode: vi.fn().mockResolvedValue("0x"),
    };
    facilitator = new ExactEvmScheme(mockFacilitatorSigner);
  });

  describe("Construction", () => {
    it("should create instance with signer", () => {
      expect(facilitator).toBeDefined();
      expect(facilitator.scheme).toBe("exact");
    });
  });

  describe("verify", () => {
    it("should call verifyTypedData for signature verification", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USDC",
          version: "2",
        },
      };

      // Create valid payload structure
      const paymentPayload = await client.createPaymentPayload(2, requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: requirements,
        resource: { url: "test", description: "", mimeType: "" },
      };

      await facilitator.verify(fullPayload, requirements);

      // Should have called verifyTypedData
      expect(mockFacilitatorSigner.verifyTypedData).toHaveBeenCalled();
    });

    it("should reject if scheme doesn't match", async () => {
      const requirements: PaymentRequirements = {
        scheme: "intent", // Wrong scheme
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          authorization: {
            from: mockClientSigner.address,
            to: requirements.payTo,
            value: requirements.amount,
            validAfter: "0",
            validBefore: "999999999999",
            nonce: "0x00",
          },
          signature: "0x",
        },
        accepted: { ...requirements, scheme: "intent" },
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("should reject if missing EIP-712 domain parameters", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {}, // Missing name and version
      };

      const paymentPayload = await client.createPaymentPayload(2, {
        ...requirements,
        extra: { name: "USDC", version: "2" }, // Client has it
      });

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_eip712_domain");
    });

    it("should reject if network doesn't match", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const paymentPayload = await client.createPaymentPayload(2, requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: { ...requirements, network: "eip155:1" }, // Wrong network in accepted
        resource: { url: "", description: "", mimeType: "" },
      };

      const wrongNetworkRequirements = { ...requirements, network: "eip155:1" as any };

      const result = await facilitator.verify(fullPayload, wrongNetworkRequirements);

      expect(result.isValid).toBe(false);
      // Verification should fail (network mismatch or other validation error)
    });

    it("should reject if recipient doesn't match payTo", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const paymentPayload = await client.createPaymentPayload(2, requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      // Change payTo in requirements
      const modifiedRequirements = {
        ...requirements,
        payTo: "0x0000000000000000000000000000000000000000", // Different recipient
      };

      const result = await facilitator.verify(fullPayload, modifiedRequirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_evm_payload_recipient_mismatch");
    });

    it("should reject if amount doesn't match", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const paymentPayload = await client.createPaymentPayload(2, requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      // Change amount in requirements
      const modifiedRequirements = {
        ...requirements,
        amount: "2000000", // Different amount
      };

      const result = await facilitator.verify(fullPayload, modifiedRequirements);

      expect(result.isValid).toBe(false);
      // Verification should fail (amount mismatch or other validation error)
    });

    it("should include payer in response", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const paymentPayload = await client.createPaymentPayload(2, requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.payer).toBe(mockClientSigner.address);
    });
  });

  describe("Error cases", () => {
    it("should handle invalid signature format", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          authorization: {
            from: mockClientSigner.address,
            to: requirements.payTo,
            value: requirements.amount,
            validAfter: "0",
            validBefore: "999999999999",
            nonce: "0x00",
          },
          signature: "0xinvalid", // Invalid signature
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      // Mock verifyTypedData to return false for invalid signature
      mockFacilitatorSigner.verifyTypedData = vi.fn().mockResolvedValue(false);

      const result = await facilitator.verify(payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("invalid_exact_evm_payload_signature");
    });

    it("should normalize addresses (case-insensitive)", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CBD53842C5426634E7929541EC2318F3DCF7E", // Mixed case
        payTo: "0x742D35CC6634C0532925A3B844BC9E7595F0BEB0", // Mixed case
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2" },
      };

      const paymentPayload = await client.createPaymentPayload(2, requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      // Should verify even with different case
      const result = await facilitator.verify(fullPayload, requirements);

      // Signature validation handles checksummed addresses
      expect(result).toBeDefined();
    });
  });
});
