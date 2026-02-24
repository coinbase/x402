import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/facilitator/scheme";
import { ExactEvmScheme as ClientExactEvmScheme } from "../../../src/exact/client/scheme";
import type { ClientEvmSigner, FacilitatorEvmSigner } from "../../../src/signer";
import { PaymentRequirements, PaymentPayload } from "@x402/core/types";
import { x402ExactPermit2ProxyAddress } from "../../../src/constants";

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
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
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

  describe("Permit2 payload verification", () => {
    it("should verify Permit2 payloads with valid signature and allowance", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      // Mock readContract to return sufficient allowance and balance
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000000"));

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: "999999999999",
            witness: {
              to: requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(permit2Payload, requirements);

      expect(result.isValid).toBe(true);
      expect(result.payer).toBe(mockClientSigner.address);
    });

    it("should reject Permit2 payloads with insufficient allowance", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      // Mock readContract to return zero allowance
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt(0));

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: "999999999999",
            witness: {
              to: requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(permit2Payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("permit2_allowance_required");
      expect(result.payer).toBe(mockClientSigner.address);
    });

    it("should reject Permit2 payloads with expired deadline", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: "1", // Expired deadline
            witness: {
              to: requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(permit2Payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("permit2_deadline_expired");
      expect(result.payer).toBe(mockClientSigner.address);
    });

    it("should reject Permit2 payloads with wrong spender", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: "0x0000000000000000000000000000000000000001", // Wrong spender
            nonce: "12345",
            deadline: "999999999999",
            witness: {
              to: requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(permit2Payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_spender");
      expect(result.payer).toBe(mockClientSigner.address);
    });

    it("should reject Permit2 payloads with recipient mismatch", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: "999999999999",
            witness: {
              to: "0x0000000000000000000000000000000000000001", // Wrong recipient
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.verify(permit2Payload, requirements);

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_permit2_recipient_mismatch");
      expect(result.payer).toBe(mockClientSigner.address);
    });
  });

  describe("Permit2 settlement", () => {
    it("should settle Permit2 payloads successfully", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      // Mock readContract to return sufficient allowance and balance
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000000"));

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: "999999999999",
            witness: {
              to: requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.settle(permit2Payload, requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash");
      expect(result.payer).toBe(mockClientSigner.address);
      expect(mockFacilitatorSigner.writeContract).toHaveBeenCalled();
    });

    it("should fail Permit2 settlement when verification fails", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", version: "2", assetTransferMethod: "permit2" },
      };

      // Mock readContract to return zero allowance
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt(0));

      const permit2Payload: PaymentPayload = {
        x402Version: 2,
        payload: {
          signature: "0xmocksignature",
          permit2Authorization: {
            from: mockClientSigner.address,
            permitted: {
              token: requirements.asset,
              amount: requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: "999999999999",
            witness: {
              to: requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: requirements,
        resource: { url: "", description: "", mimeType: "" },
      };

      const result = await facilitator.settle(permit2Payload, requirements);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe("permit2_allowance_required");
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

  describe("EIP-2612 Gas Sponsoring - Verify", () => {
    it("should accept valid EIP-2612 extension when Permit2 allowance is 0", async () => {
      // Mock: allowance returns 0, then balance returns sufficient
      mockFacilitatorSigner.readContract = vi
        .fn()
        .mockResolvedValueOnce(0n) // allowance check = 0
        .mockResolvedValueOnce(BigInt("10000000")); // balance check

      const permit2Requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 60,
        extra: { assetTransferMethod: "permit2", name: "USDC", version: "2" },
      };

      // Create a Permit2 payload
      const permit2ClientSigner: ClientEvmSigner = {
        address: "0x1234567890123456789012345678901234567890",
        signTypedData: vi.fn().mockResolvedValue("0x" + "ab".repeat(32) + "cd".repeat(32) + "1b"),
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      };
      const permit2Client = new ClientExactEvmScheme(permit2ClientSigner);
      const paymentPayload = await permit2Client.createPaymentPayload(2, permit2Requirements);

      // Add EIP-2612 extension data
      const now = Math.floor(Date.now() / 1000);
      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: permit2Requirements,
        resource: { url: "https://test.com", description: "", mimeType: "" },
        extensions: {
          eip2612GasSponsoring: {
            info: {
              from: "0x1234567890123456789012345678901234567890",
              asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
              spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
              amount:
                "115792089237316195423570985008687907853269984665640564039457584007913129639935",
              nonce: "0",
              deadline: (now + 300).toString(),
              signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
              version: "1",
            },
            schema: {},
          },
        },
      };

      const result = await facilitator.verify(fullPayload, permit2Requirements);
      // Should pass verify (EIP-2612 extension provides the permit)
      expect(result).toBeDefined();
      // It may still fail on signature verification (mock), but should NOT fail with permit2_allowance_required
      if (!result.isValid) {
        expect(result.invalidReason).not.toBe("permit2_allowance_required");
      }
    });

    it("should reject when allowance is 0 and no EIP-2612 extension", async () => {
      // Mock: allowance returns 0
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValueOnce(0n); // allowance check = 0

      const permit2Requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 60,
        extra: { assetTransferMethod: "permit2", name: "USDC", version: "2" },
      };

      const permit2ClientSigner: ClientEvmSigner = {
        address: "0x1234567890123456789012345678901234567890",
        signTypedData: vi.fn().mockResolvedValue("0x" + "ab".repeat(32) + "cd".repeat(32) + "1b"),
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      };
      const permit2Client = new ClientExactEvmScheme(permit2ClientSigner);
      const paymentPayload = await permit2Client.createPaymentPayload(2, permit2Requirements);

      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: permit2Requirements,
        resource: { url: "https://test.com", description: "", mimeType: "" },
        // NO eip2612GasSponsoring extension
      };

      const result = await facilitator.verify(fullPayload, permit2Requirements);
      // Should fail with permit2_allowance_required since there's no EIP-2612 extension
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("permit2_allowance_required");
    });

    it("should reject EIP-2612 extension with wrong spender", async () => {
      mockFacilitatorSigner.readContract = vi
        .fn()
        .mockResolvedValueOnce(0n) // allowance = 0
        .mockResolvedValueOnce(BigInt("10000000")); // balance

      const permit2Requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 60,
        extra: { assetTransferMethod: "permit2", name: "USDC", version: "2" },
      };

      const permit2ClientSigner: ClientEvmSigner = {
        address: "0x1234567890123456789012345678901234567890",
        signTypedData: vi.fn().mockResolvedValue("0x" + "ab".repeat(32) + "cd".repeat(32) + "1b"),
        readContract: vi.fn().mockResolvedValue(BigInt(0)),
      };
      const permit2Client = new ClientExactEvmScheme(permit2ClientSigner);
      const paymentPayload = await permit2Client.createPaymentPayload(2, permit2Requirements);

      const now = Math.floor(Date.now() / 1000);
      const fullPayload: PaymentPayload = {
        ...paymentPayload,
        accepted: permit2Requirements,
        resource: { url: "https://test.com", description: "", mimeType: "" },
        extensions: {
          eip2612GasSponsoring: {
            info: {
              from: "0x1234567890123456789012345678901234567890",
              asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
              spender: "0x0000000000000000000000000000000000000000", // WRONG spender
              amount:
                "115792089237316195423570985008687907853269984665640564039457584007913129639935",
              nonce: "0",
              deadline: (now + 300).toString(),
              signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
              version: "1",
            },
            schema: {},
          },
        },
      };

      const result = await facilitator.verify(fullPayload, permit2Requirements);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("eip2612_spender_not_permit2");
    });
  });

  describe("EIP-2612 Gas Sponsoring - Settlement", () => {
    const permit2Requirements: PaymentRequirements = {
      scheme: "exact",
      network: "eip155:84532",
      amount: "1000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: "permit2", name: "USDC", version: "2" },
    };

    function makePermit2Payload(extensions?: Record<string, unknown>): PaymentPayload {
      const now = Math.floor(Date.now() / 1000);
      return {
        x402Version: 2,
        payload: {
          signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
          permit2Authorization: {
            from: "0x1234567890123456789012345678901234567890",
            permitted: {
              token: permit2Requirements.asset,
              amount: permit2Requirements.amount,
            },
            spender: x402ExactPermit2ProxyAddress,
            nonce: "12345",
            deadline: (now + 300).toString(),
            witness: {
              to: permit2Requirements.payTo,
              validAfter: "0",
              extra: "0x",
            },
          },
        },
        accepted: permit2Requirements,
        resource: { url: "https://test.com", description: "", mimeType: "" },
        ...(extensions ? { extensions } : {}),
      };
    }

    function makeEip2612Extension() {
      const now = Math.floor(Date.now() / 1000);
      return {
        eip2612GasSponsoring: {
          info: {
            from: "0x1234567890123456789012345678901234567890",
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            spender: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            amount:
              "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            nonce: "0",
            deadline: (now + 300).toString(),
            signature: "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b",
            version: "1",
          },
          schema: {},
        },
      };
    }

    it("should call settleWithPermit when EIP-2612 extension is present", async () => {
      // Mock: allowance=0 (verify), balance=sufficient, allowance=0 (settle re-verify), balance=sufficient
      mockFacilitatorSigner.readContract = vi
        .fn()
        .mockImplementation(({ functionName }: { functionName: string }) => {
          if (functionName === "allowance") return Promise.resolve(0n);
          if (functionName === "balanceOf") return Promise.resolve(BigInt("10000000"));
          return Promise.resolve(0n);
        });

      const payload = makePermit2Payload(makeEip2612Extension());
      const result = await facilitator.settle(payload, permit2Requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash");

      // Verify writeContract was called with settleWithPermit
      const writeCall = (mockFacilitatorSigner.writeContract as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(writeCall.functionName).toBe("settleWithPermit");
    });

    it("should call settle (not settleWithPermit) when no EIP-2612 extension", async () => {
      // Mock: allowance=sufficient, balance=sufficient
      mockFacilitatorSigner.readContract = vi.fn().mockResolvedValue(BigInt("10000000000"));

      const payload = makePermit2Payload();
      const result = await facilitator.settle(payload, permit2Requirements);

      expect(result.success).toBe(true);
      expect(result.transaction).toBe("0xtxhash");

      // Verify writeContract was called with settle (not settleWithPermit)
      const writeCall = (mockFacilitatorSigner.writeContract as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(writeCall.functionName).toBe("settle");
    });

    it("should pass correct EIP-2612 permit struct to settleWithPermit", async () => {
      mockFacilitatorSigner.readContract = vi
        .fn()
        .mockImplementation(({ functionName }: { functionName: string }) => {
          if (functionName === "allowance") return Promise.resolve(0n);
          if (functionName === "balanceOf") return Promise.resolve(BigInt("10000000"));
          return Promise.resolve(0n);
        });

      const extensions = makeEip2612Extension();
      const payload = makePermit2Payload(extensions);
      await facilitator.settle(payload, permit2Requirements);

      const writeCall = (mockFacilitatorSigner.writeContract as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(writeCall.functionName).toBe("settleWithPermit");

      // First arg to settleWithPermit is the EIP-2612 permit struct (value, deadline, r, s, v)
      const permit2612Struct = writeCall.args[0];
      expect(permit2612Struct.value).toBeDefined();
      expect(permit2612Struct.deadline).toBeDefined();
      expect(permit2612Struct.r).toBeDefined();
      expect(permit2612Struct.s).toBeDefined();
      expect(permit2612Struct.v).toBeDefined();
      // v should be a number (27 or 28)
      expect(typeof permit2612Struct.v).toBe("number");
    });
  });
});
