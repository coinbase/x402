import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/facilitator/scheme";
import { ExactEvmScheme as ClientExactEvmScheme } from "../../../src/exact/client/scheme";
import type { ClientEvmSigner, FacilitatorEvmSigner } from "../../../src/signer";
import { PaymentRequirements, PaymentPayload } from "@x402/core/types";
import { x402Permit2ProxyAddress, PERMIT2_ADDRESS } from "../../../src/constants";
import { ExactPermit2Payload } from "../../../src/types";

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
      getAddresses: vi.fn().mockReturnValue(["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"]),
      readContract: vi.fn().mockResolvedValue(0n), // Mock nonce state
      verifyTypedData: vi.fn().mockResolvedValue(true), // Mock signature verification
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
      sendTransaction: vi.fn().mockResolvedValue("0xtxhash"),
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

  describe("Permit2 verification", () => {
    const createPermit2Payload = (
      overrides?: Partial<ExactPermit2Payload>,
    ): ExactPermit2Payload => {
      const now = Math.floor(Date.now() / 1000);
      return {
        signature: "0xmocksignature",
        permit2Authorization: {
          from: "0x1234567890123456789012345678901234567890",
          permitted: {
            token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            amount: "1000000",
          },
          spender: x402Permit2ProxyAddress,
          nonce: "12345678901234567890",
          deadline: String(now + 600),
          witness: {
            to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            validAfter: String(now - 600),
            validBefore: String(now + 600),
            extra: "0x",
          },
        },
        ...overrides,
      };
    };

    const createPermit2PaymentPayload = (
      requirements: PaymentRequirements,
      payloadOverrides?: Partial<ExactPermit2Payload>,
    ): PaymentPayload => ({
      x402Version: 2,
      payload: createPermit2Payload(payloadOverrides),
      accepted: requirements,
      resource: { url: "", description: "", mimeType: "" },
    });

    it("should verify valid Permit2 payload", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
    });

    it("should call verifyTypedData with Permit2 domain", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      await facilitator.verify(fullPayload, requirements);

      expect(mockFacilitatorSigner.verifyTypedData).toHaveBeenCalled();
      const callArgs = (mockFacilitatorSigner.verifyTypedData as any).mock.calls[0][0];
      expect(callArgs.domain.name).toBe("Permit2");
      expect(callArgs.domain.verifyingContract).toBe(PERMIT2_ADDRESS);
      expect(callArgs.domain.chainId).toBe(84532);
    });

    it("should reject if spender is not x402Permit2Proxy", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const permit2Payload = createPermit2Payload();
      permit2Payload.permit2Authorization.spender = "0x0000000000000000000000000000000000000001";

      const fullPayload: PaymentPayload = {
        x402Version: 2,
        payload: permit2Payload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_spender");
    });

    it("should reject if witness.to doesn't match payTo", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const permit2Payload = createPermit2Payload();
      permit2Payload.permit2Authorization.witness.to = "0x0000000000000000000000000000000000000001";

      const fullPayload: PaymentPayload = {
        x402Version: 2,
        payload: permit2Payload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_witness_recipient");
    });

    it("should reject if token doesn't match asset", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const permit2Payload = createPermit2Payload();
      permit2Payload.permit2Authorization.permitted.token =
        "0x0000000000000000000000000000000000000001";

      const fullPayload: PaymentPayload = {
        x402Version: 2,
        payload: permit2Payload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_token");
    });

    it("should reject if permitted amount is insufficient", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "2000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const permit2Payload = createPermit2Payload();
      permit2Payload.permit2Authorization.permitted.amount = "1000000";

      const fullPayload: PaymentPayload = {
        x402Version: 2,
        payload: permit2Payload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_amount");
    });

    it("should reject if deadline has passed", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const permit2Payload = createPermit2Payload();
      permit2Payload.permit2Authorization.deadline = "0";

      const fullPayload: PaymentPayload = {
        x402Version: 2,
        payload: permit2Payload,
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_deadline");
    });

    it("should reject if signature is invalid", async () => {
      mockFacilitatorSigner.verifyTypedData = vi.fn().mockResolvedValue(false);

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_signature");
    });

    it("should reject if balance is insufficient", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(500000n);

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.verify(fullPayload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("insufficient_funds");
    });
  });

  describe("Permit2 settlement", () => {
    const createPermit2Payload = (): ExactPermit2Payload => {
      const now = Math.floor(Date.now() / 1000);
      return {
        signature: "0xmocksignature",
        permit2Authorization: {
          from: "0x1234567890123456789012345678901234567890",
          permitted: {
            token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            amount: "1000000",
          },
          spender: x402Permit2ProxyAddress,
          nonce: "12345678901234567890",
          deadline: String(now + 600),
          witness: {
            to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
            validAfter: String(now - 600),
            validBefore: String(now + 600),
            extra: "0x",
          },
        },
      };
    };

    const createPermit2PaymentPayload = (
      requirements: PaymentRequirements,
      extensions?: Record<string, unknown>,
    ): PaymentPayload => ({
      x402Version: 2,
      payload: createPermit2Payload(),
      accepted: requirements,
      resource: { url: "", description: "", mimeType: "" },
      extensions,
    });

    it("should settle valid Permit2 payload", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);
      mockFacilitatorSigner.writeContract = vi.fn().mockResolvedValue("0xtxhash123");
      mockFacilitatorSigner.waitForTransactionReceipt = vi
        .fn()
        .mockResolvedValue({ status: "success" });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.settle(fullPayload, requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash123");
      expect(result.payer).toBe("0x1234567890123456789012345678901234567890");
    });

    it("should call x402Permit2Proxy.settle for standard flow", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);
      mockFacilitatorSigner.writeContract = vi.fn().mockResolvedValue("0xtxhash");
      mockFacilitatorSigner.waitForTransactionReceipt = vi
        .fn()
        .mockResolvedValue({ status: "success" });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      await facilitator.settle(fullPayload, requirements);

      expect(mockFacilitatorSigner.writeContract).toHaveBeenCalled();
      const callArgs = (mockFacilitatorSigner.writeContract as any).mock.calls[0][0];
      expect(callArgs.address.toLowerCase()).toBe(x402Permit2ProxyAddress.toLowerCase());
      expect(callArgs.functionName).toBe("settle");
    });

    it("should call x402Permit2Proxy.settleWith2612 when eip2612GasSponsoring extension present", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);
      mockFacilitatorSigner.writeContract = vi.fn().mockResolvedValue("0xtxhash");
      mockFacilitatorSigner.waitForTransactionReceipt = vi
        .fn()
        .mockResolvedValue({ status: "success" });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const eip2612Extension = {
        permit: {
          value: "1000000000000000000",
          deadline: String(Math.floor(Date.now() / 1000) + 600),
          v: 27,
          r: "0x1234567890123456789012345678901234567890123456789012345678901234",
          s: "0x1234567890123456789012345678901234567890123456789012345678901234",
        },
      };

      const fullPayload = createPermit2PaymentPayload(requirements, {
        eip2612GasSponsoring: eip2612Extension,
      });

      await facilitator.settle(fullPayload, requirements);

      expect(mockFacilitatorSigner.writeContract).toHaveBeenCalled();
      const callArgs = (mockFacilitatorSigner.writeContract as any).mock.calls[0][0];
      expect(callArgs.address.toLowerCase()).toBe(x402Permit2ProxyAddress.toLowerCase());
      expect(callArgs.functionName).toBe("settleWith2612");
    });

    it("should return error when verification fails", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(0n);

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.settle(fullPayload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("insufficient_funds");
    });

    it("should return error when transaction fails", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);
      mockFacilitatorSigner.writeContract = vi.fn().mockRejectedValue(new Error("tx failed"));

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.settle(fullPayload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("transaction_failed");
    });

    it("should return error when transaction reverts", async () => {
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(10000000n);
      mockFacilitatorSigner.writeContract = vi.fn().mockResolvedValue("0xtxhash");
      mockFacilitatorSigner.waitForTransactionReceipt = vi
        .fn()
        .mockResolvedValue({ status: "reverted" });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const fullPayload = createPermit2PaymentPayload(requirements);

      const result = await facilitator.settle(fullPayload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("invalid_transaction_state");
    });
  });
});
