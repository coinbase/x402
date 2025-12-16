import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/client/scheme";
import type { ClientEvmSigner } from "../../../src/signer";
import { PaymentRequirements } from "@x402/core/types";

describe("ExactEvmScheme (Client)", () => {
  let client: ExactEvmScheme;
  let mockSigner: ClientEvmSigner;

  beforeEach(() => {
    // Create mock signer
    mockSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature123456789"),
    };
    client = new ExactEvmScheme(mockSigner);
  });

  describe("Construction", () => {
    it("should create instance with signer", () => {
      expect(client).toBeDefined();
      expect(client.scheme).toBe("exact");
    });
  });

  describe("createPaymentPayload", () => {
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
});
