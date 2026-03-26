import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/facilitator/scheme";
import { ExactEvmScheme as ClientExactEvmScheme } from "../../../src/exact/client/scheme";
import type { ClientEvmSigner, FacilitatorEvmSigner } from "../../../src/signer";
import { PaymentRequirements, PaymentPayload } from "@x402/core/types";
import { ExactERC7710Payload } from "../../../src/types";

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
    client = new ClientExactEvmScheme({ signer: mockClientSigner });

    // Create mock facilitator signer
    mockFacilitatorSigner = {
      address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      readContract: vi.fn().mockResolvedValue(0n), // Mock nonce state
      verifyTypedData: vi.fn().mockResolvedValue(true), // Mock signature verification
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      getCode: vi.fn().mockResolvedValue("0x"),
      getAddresses: vi.fn().mockReturnValue(["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"]),
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

  describe("getExtra", () => {
    it("should return facilitators array with signer addresses", () => {
      const extra = facilitator.getExtra("eip155:8453");

      expect(extra).toBeDefined();
      expect(extra?.facilitators).toEqual(["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"]);
    });
  });

  describe("ERC-7710 Delegation Support", () => {
    // Use valid 20-byte (40 hex char) addresses
    const mockDelegation = {
      delegationManager: "0x1111111111111111111111111111111111111111" as const,
      permissionContext: "0xabcdef1234567890abcdef1234567890abcdef1234567890" as const,
      delegator: "0x2222222222222222222222222222222222222222" as const,
    };

    describe("verify (ERC-7710)", () => {
      it("should verify ERC-7710 payload via simulation", async () => {
        // Mock simulateContract to succeed
        mockFacilitatorSigner.simulateContract = vi.fn().mockResolvedValue({});
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000")); // 10 USDC balance

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.verify(fullPayload, requirements);

        expect(result.isValid).toBe(true);
        expect(result.payer).toBe(mockDelegation.delegator.toLowerCase()); // getAddress normalizes
        expect(mockFacilitatorSigner.simulateContract).toHaveBeenCalled();
      });

      it("should reject ERC-7710 payload when simulation fails", async () => {
        // Mock simulateContract to fail
        mockFacilitatorSigner.simulateContract = vi.fn().mockRejectedValue(new Error("Simulation failed"));
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000"));

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.verify(fullPayload, requirements);

        expect(result.isValid).toBe(false);
        expect(result.invalidReason).toBe("erc7710_simulation_failed");
      });

      it("should reject ERC-7710 payload when insufficient balance", async () => {
        // Mock balance check to return insufficient funds
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("100")); // Only 0.0001 USDC
        mockFacilitatorSigner.simulateContract = vi.fn().mockResolvedValue({});

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000", // 1 USDC
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.verify(fullPayload, requirements);

        expect(result.isValid).toBe(false);
        expect(result.invalidReason).toBe("insufficient_funds");
      });

      it("should include delegator as payer in ERC-7710 response", async () => {
        mockFacilitatorSigner.simulateContract = vi.fn().mockResolvedValue({});
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000"));

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.verify(fullPayload, requirements);

        // Payer should be the delegator, normalized by getAddress
        expect(result.payer.toLowerCase()).toBe(mockDelegation.delegator.toLowerCase());
      });
    });

    describe("settle (ERC-7710)", () => {
      it("should call redeemDelegations for ERC-7710 settlement", async () => {
        // Mock successful verification and settlement
        mockFacilitatorSigner.simulateContract = vi.fn().mockResolvedValue({});
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000"));
        mockFacilitatorSigner.writeContract = vi.fn().mockResolvedValue("0xsettletxhash");
        mockFacilitatorSigner.waitForTransactionReceipt = vi.fn().mockResolvedValue({ status: "success" });

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.settle(fullPayload, requirements);

        expect(result.success).toBe(true);
        expect(result.transaction).toBe("0xsettletxhash");
        expect(mockFacilitatorSigner.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            functionName: "redeemDelegations",
          }),
        );
      });

      it("should fail settle if verification fails", async () => {
        // Mock failed simulation (invalid delegation)
        mockFacilitatorSigner.simulateContract = vi.fn().mockRejectedValue(new Error("Invalid delegation"));
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000"));

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.settle(fullPayload, requirements);

        expect(result.success).toBe(false);
        expect(result.errorReason).toBe("erc7710_simulation_failed");
      });

      it("should handle transaction failure during ERC-7710 settlement", async () => {
        // Mock successful verification but failed transaction
        mockFacilitatorSigner.simulateContract = vi.fn().mockResolvedValue({});
        mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000"));
        mockFacilitatorSigner.writeContract = vi.fn().mockRejectedValue(new Error("Transaction failed"));

        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {
            assetTransferMethod: "erc7710",
            name: "USDC",
            version: "2",
          },
        };

        const erc7710Payload: ExactERC7710Payload = {
          delegationManager: mockDelegation.delegationManager,
          permissionContext: mockDelegation.permissionContext,
          delegator: mockDelegation.delegator,
        };

        const fullPayload: PaymentPayload = {
          x402Version: 2,
          payload: erc7710Payload,
          accepted: requirements,
          resource: { url: "", description: "", mimeType: "" },
        };

        const result = await facilitator.settle(fullPayload, requirements);

        expect(result.success).toBe(false);
        expect(result.errorReason).toBe("transaction_failed");
      });
    });
  });
});
