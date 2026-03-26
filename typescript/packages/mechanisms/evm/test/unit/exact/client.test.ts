import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/client/scheme";
import type { ClientEvmSigner } from "../../../src/signer";
import type { ERC7710PaymentProvider, ERC7710PaymentDelegation } from "../../../src/types";
import { PaymentRequirements } from "@x402/core/types";
import { isERC7710Payload, isEIP3009Payload } from "../../../src/types";

describe("ExactEvmScheme (Client)", () => {
  let client: ExactEvmScheme;
  let mockSigner: ClientEvmSigner;

  beforeEach(() => {
    // Create mock signer
    mockSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature123456789"),
    };
    client = new ExactEvmScheme({ signer: mockSigner });
  });

  describe("Construction", () => {
    it("should create instance with signer", () => {
      expect(client).toBeDefined();
      expect(client.scheme).toBe("exact");
    });

    it("should create instance with erc7710Provider", () => {
      const mockProvider: ERC7710PaymentProvider = {
        delegator: "0x2222222222222222222222222222222222222222",
        createX402PaymentDelegation: vi.fn(),
      };
      const clientWith7710 = new ExactEvmScheme({ erc7710Provider: mockProvider });
      expect(clientWith7710).toBeDefined();
      expect(clientWith7710.scheme).toBe("exact");
    });

    it("should create instance with both signer and erc7710Provider", () => {
      const mockProvider: ERC7710PaymentProvider = {
        delegator: "0x2222222222222222222222222222222222222222",
        createX402PaymentDelegation: vi.fn(),
      };
      const hybridClient = new ExactEvmScheme({
        signer: mockSigner,
        erc7710Provider: mockProvider,
      });
      expect(hybridClient).toBeDefined();
    });

    it("should throw error when neither signer nor erc7710Provider is provided", () => {
      expect(() => new ExactEvmScheme({} as any)).toThrow(
        "ExactEvmScheme requires either a signer (for EIP-3009) or an ERC7710PaymentProvider",
      );
    });
  });

  describe("createPaymentPayload - EIP-3009", () => {
    it("should create payment payload with EIP-3009 authorization", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
        },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.x402Version).toBe(2);
      expect(result.payload).toBeDefined();
      expect(result.payload.authorization).toBeDefined();
      expect(result.payload.signature).toBeDefined();
    });

    it("should generate valid nonce", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const result1 = await client.createPaymentPayload(2, requirements);
      const result2 = await client.createPaymentPayload(2, requirements);

      // Nonces should be different
      expect(result1.payload.authorization.nonce).not.toBe(result2.payload.authorization.nonce);

      // Nonce should be 32 bytes hex string
      expect(result1.payload.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it("should set validAfter to 10 minutes before current time", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const beforeTime = Math.floor(Date.now() / 1000) - 600;
      const result = await client.createPaymentPayload(2, requirements);
      const afterTime = Math.floor(Date.now() / 1000) - 600;

      const validAfter = parseInt(result.payload.authorization.validAfter);

      expect(validAfter).toBeGreaterThanOrEqual(beforeTime);
      expect(validAfter).toBeLessThanOrEqual(afterTime + 1); // Allow 1 second tolerance
    });

    it("should set validBefore based on maxTimeoutSeconds", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 600, // 10 minutes
        extra: { name: "USD Coin", version: "2" },
      };

      const beforeTime = Math.floor(Date.now() / 1000) + 600;
      const result = await client.createPaymentPayload(2, requirements);
      const afterTime = Math.floor(Date.now() / 1000) + 600;

      const validBefore = parseInt(result.payload.authorization.validBefore);

      expect(validBefore).toBeGreaterThanOrEqual(beforeTime);
      expect(validBefore).toBeLessThanOrEqual(afterTime + 1);
    });

    it("should use signer's address as from", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.authorization.from).toBe(mockSigner.address);
    });

    it("should use requirements.payTo as to", async () => {
      const payToAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: payToAddress,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.authorization.to.toLowerCase()).toBe(payToAddress.toLowerCase());
    });

    it("should use requirements.amount as value", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "2500000", // 2.5 USDC
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.authorization.value).toBe("2500000");
    });

    it("should call signTypedData on signer", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      // Should have called signTypedData
      expect(mockSigner.signTypedData).toHaveBeenCalled();
      expect(result.payload.signature).toBeDefined();
    });

    it("should handle different networks", async () => {
      const ethereumRequirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:1", // Ethereum mainnet
        amount: "1000000",
        asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      const result = await client.createPaymentPayload(2, ethereumRequirements);

      expect(result.x402Version).toBe(2);
      expect(result.payload.authorization).toBeDefined();
    });

    it("should pass correct EIP-712 domain to signTypedData", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      };

      await client.createPaymentPayload(2, requirements);

      // Verify signTypedData was called with domain params
      expect(mockSigner.signTypedData).toHaveBeenCalled();
      const callArgs = (mockSigner.signTypedData as any).mock.calls[0][0];
      expect(callArgs.domain.name).toBe("USD Coin");
      expect(callArgs.domain.version).toBe("2");
      expect(callArgs.domain.chainId).toBe(8453);
    });
  });

  describe("ERC-7710 Payment Provider Support", () => {
    const mockDelegation: ERC7710PaymentDelegation = {
      delegationManager: "0x1111111111111111111111111111111111111111",
      permissionContext: "0xabcdef1234567890abcdef1234567890abcdef1234567890",
      authorizedRedeemers: ["0x3333333333333333333333333333333333333333"],
    };

    const createMockProvider = (): ERC7710PaymentProvider => ({
      delegator: "0x2222222222222222222222222222222222222222",
      createX402PaymentDelegation: vi.fn().mockResolvedValue(mockDelegation),
    });

    it("should create ERC-7710 payload when provider and facilitators are available", async () => {
      const mockProvider = createMockProvider();
      const clientWith7710 = new ExactEvmScheme({ erc7710Provider: mockProvider });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitators: ["0x3333333333333333333333333333333333333333"],
        },
      };

      const result = await clientWith7710.createPaymentPayload(2, requirements);

      expect(result.x402Version).toBe(2);
      expect(isERC7710Payload(result.payload as any)).toBe(true);
      expect(result.payload).toEqual({
        delegationManager: mockDelegation.delegationManager,
        permissionContext: mockDelegation.permissionContext,
        delegator: mockProvider.delegator,
      });
    });

    it("should call createX402PaymentDelegation with correct params", async () => {
      const mockProvider = createMockProvider();
      const clientWith7710 = new ExactEvmScheme({ erc7710Provider: mockProvider });

      const facilitators = ["0x3333333333333333333333333333333333333333"];
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitators,
        },
      };

      await clientWith7710.createPaymentPayload(2, requirements);

      expect(mockProvider.createX402PaymentDelegation).toHaveBeenCalledWith(
        expect.objectContaining({
          redeemers: facilitators,
          amount: BigInt("1000000"),
          maxTimeoutSeconds: 300,
        }),
      );

      // Verify addresses are checksummed (normalized by getAddress)
      const callArgs = (mockProvider.createX402PaymentDelegation as any).mock.calls[0][0];
      expect(callArgs.payTo.toLowerCase()).toBe("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0".toLowerCase());
      expect(callArgs.asset.toLowerCase()).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase());
    });

    it("should not call signTypedData for ERC-7710 payload", async () => {
      const mockProvider = createMockProvider();
      const hybridClient = new ExactEvmScheme({
        signer: mockSigner,
        erc7710Provider: mockProvider,
      });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitators: ["0x3333333333333333333333333333333333333333"],
        },
      };

      await hybridClient.createPaymentPayload(2, requirements);

      // ERC-7710 uses provider, not signTypedData
      expect(mockSigner.signTypedData).not.toHaveBeenCalled();
    });

    it("should fall back to EIP-3009 when no facilitators in requirements", async () => {
      const mockProvider = createMockProvider();
      const hybridClient = new ExactEvmScheme({
        signer: mockSigner,
        erc7710Provider: mockProvider,
      });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
        // No facilitators
      };

      const result = await hybridClient.createPaymentPayload(2, requirements);

      expect(isEIP3009Payload(result.payload as any)).toBe(true);
      expect(mockProvider.createX402PaymentDelegation).not.toHaveBeenCalled();
    });

    it("should fall back to EIP-3009 when ERC-7710 provider throws", async () => {
      const mockProvider: ERC7710PaymentProvider = {
        delegator: "0x2222222222222222222222222222222222222222",
        createX402PaymentDelegation: vi.fn().mockRejectedValue(new Error("Insufficient allowance")),
      };
      const hybridClient = new ExactEvmScheme({
        signer: mockSigner,
        erc7710Provider: mockProvider,
      });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitators: ["0x3333333333333333333333333333333333333333"],
        },
      };

      const result = await hybridClient.createPaymentPayload(2, requirements);

      // Should fall back to EIP-3009
      expect(isEIP3009Payload(result.payload as any)).toBe(true);
      expect(mockSigner.signTypedData).toHaveBeenCalled();
    });

    it("should throw when ERC-7710 fails and no signer available", async () => {
      const mockProvider: ERC7710PaymentProvider = {
        delegator: "0x2222222222222222222222222222222222222222",
        createX402PaymentDelegation: vi.fn().mockRejectedValue(new Error("Insufficient allowance")),
      };
      const providerOnlyClient = new ExactEvmScheme({ erc7710Provider: mockProvider });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitators: ["0x3333333333333333333333333333333333333333"],
        },
      };

      await expect(providerOnlyClient.createPaymentPayload(2, requirements)).rejects.toThrow(
        "Insufficient allowance",
      );
    });

    it("should throw when provider returns no authorized redeemers", async () => {
      const mockProvider: ERC7710PaymentProvider = {
        delegator: "0x2222222222222222222222222222222222222222",
        createX402PaymentDelegation: vi.fn().mockResolvedValue({
          delegationManager: "0x1111111111111111111111111111111111111111",
          permissionContext: "0xabcdef",
          authorizedRedeemers: [], // Empty!
        }),
      };
      const providerOnlyClient = new ExactEvmScheme({ erc7710Provider: mockProvider });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD Coin",
          version: "2",
          facilitators: ["0x3333333333333333333333333333333333333333"],
        },
      };

      await expect(providerOnlyClient.createPaymentPayload(2, requirements)).rejects.toThrow(
        "ERC-7710 provider did not authorize any redeemers",
      );
    });

    it("should throw when no facilitators and no signer available", async () => {
      const mockProvider = createMockProvider();
      const providerOnlyClient = new ExactEvmScheme({ erc7710Provider: mockProvider });

      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
        // No facilitators
      };

      await expect(providerOnlyClient.createPaymentPayload(2, requirements)).rejects.toThrow(
        "Cannot create payment: ERC-7710 requires facilitators in payment requirements",
      );
    });
  });
});
