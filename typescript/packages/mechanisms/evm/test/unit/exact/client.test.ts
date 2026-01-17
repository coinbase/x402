import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExactEvmScheme } from "../../../src/exact/client/scheme";
import {
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams,
} from "../../../src/exact/client/permit2";
import type { ClientEvmSigner } from "../../../src/signer";
import { PaymentRequirements } from "@x402/core/types";
import { PERMIT2_ADDRESS, x402Permit2ProxyAddress } from "../../../src/constants";
import {
  isPermit2Payload,
  isEIP3009Payload,
  ExactPermit2Payload,
  ExactEIP3009Payload,
} from "../../../src/types";

describe("ExactEvmScheme (Client)", () => {
  let client: ExactEvmScheme;
  let mockSigner: ClientEvmSigner;

  beforeEach(() => {
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
      const payload1 = result1.payload as ExactEIP3009Payload;
      const payload2 = result2.payload as ExactEIP3009Payload;

      // Nonces should be different
      expect(payload1.authorization.nonce).not.toBe(payload2.authorization.nonce);

      // Nonce should be 32 bytes hex string
      expect(payload1.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
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
      const payload = result.payload as ExactEIP3009Payload;
      const afterTime = Math.floor(Date.now() / 1000) - 600;

      const validAfter = parseInt(payload.authorization.validAfter);

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
      const payload = result.payload as ExactEIP3009Payload;
      const afterTime = Math.floor(Date.now() / 1000) + 600;

      const validBefore = parseInt(payload.authorization.validBefore);

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
      const payload = result.payload as ExactEIP3009Payload;

      expect(payload.authorization.from).toBe(mockSigner.address);
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
      const payload = result.payload as ExactEIP3009Payload;

      expect(payload.authorization.to.toLowerCase()).toBe(payToAddress.toLowerCase());
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
      const payload = result.payload as ExactEIP3009Payload;

      expect(payload.authorization.value).toBe("2500000");
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
      const payload = result.payload as ExactEIP3009Payload;

      // Should have called signTypedData
      expect(mockSigner.signTypedData).toHaveBeenCalled();
      expect(payload.signature).toBeDefined();
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
      const payload = result.payload as ExactEIP3009Payload;

      expect(result.x402Version).toBe(2);
      expect(payload.authorization).toBeDefined();
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

    describe("with assetTransferMethod", () => {
      it("should default to EIP-3009 when assetTransferMethod is not set", async () => {
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
        const payload = result.payload as ExactEIP3009Payload;

        expect(isEIP3009Payload(payload)).toBe(true);
        expect(isPermit2Payload(payload)).toBe(false);
        expect(payload.authorization).toBeDefined();
      });

      it("should use EIP-3009 when assetTransferMethod is eip3009", async () => {
        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:8453",
          amount: "1000000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
        };

        const result = await client.createPaymentPayload(2, requirements);
        const payload = result.payload as ExactEIP3009Payload;

        expect(isEIP3009Payload(payload)).toBe(true);
        expect(payload.authorization).toBeDefined();
      });

      it("should use Permit2 when assetTransferMethod is permit2", async () => {
        const requirements: PaymentRequirements = {
          scheme: "exact",
          network: "eip155:8453",
          amount: "1000000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2", assetTransferMethod: "permit2" },
        };

        const result = await client.createPaymentPayload(2, requirements);
        const payload = result.payload as ExactPermit2Payload;

        expect(isPermit2Payload(payload)).toBe(true);
        expect(isEIP3009Payload(payload)).toBe(false);
        expect(payload.permit2Authorization).toBeDefined();
      });
    });
  });

  describe("createPaymentPayload with Permit2", () => {
    it("should create Permit2 payload with correct structure", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      expect(isPermit2Payload(payload)).toBe(true);
      expect(payload.signature).toBeDefined();
      expect(payload.permit2Authorization).toBeDefined();
      expect(payload.permit2Authorization.permitted).toBeDefined();
      expect(payload.permit2Authorization.witness).toBeDefined();
    });

    it("should set spender to x402Permit2Proxy address", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      expect(payload.permit2Authorization.spender.toLowerCase()).toBe(
        x402Permit2ProxyAddress.toLowerCase(),
      );
    });

    it("should set witness.to to payTo address", async () => {
      const payToAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: payToAddress,
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      expect(payload.permit2Authorization.witness.to.toLowerCase()).toBe(
        payToAddress.toLowerCase(),
      );
    });

    it("should set permitted.token to asset address", async () => {
      const assetAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: assetAddress,
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      expect(payload.permit2Authorization.permitted.token.toLowerCase()).toBe(
        assetAddress.toLowerCase(),
      );
    });

    it("should set permitted.amount to requirements.amount", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "2500000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      expect(payload.permit2Authorization.permitted.amount).toBe("2500000");
    });

    it("should set from to signer address", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      expect(payload.permit2Authorization.from).toBe(mockSigner.address);
    });

    it("should generate different nonces for each call", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result1 = await client.createPaymentPayload(2, requirements);
      const result2 = await client.createPaymentPayload(2, requirements);
      const payload1 = result1.payload as ExactPermit2Payload;
      const payload2 = result2.payload as ExactPermit2Payload;

      expect(payload1.permit2Authorization.nonce).not.toBe(payload2.permit2Authorization.nonce);
    });

    it("should set deadline based on maxTimeoutSeconds", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 600,
        extra: { assetTransferMethod: "permit2" },
      };

      const beforeTime = Math.floor(Date.now() / 1000) + 600;
      const afterTime = Math.floor(Date.now() / 1000) + 600;

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload as ExactPermit2Payload;

      const deadline = parseInt(payload.permit2Authorization.deadline);

      expect(deadline).toBeGreaterThanOrEqual(beforeTime);
      expect(deadline).toBeLessThanOrEqual(afterTime + 1);
    });

    it("should pass correct EIP-712 domain for Permit2 to signTypedData", async () => {
      const requirements: PaymentRequirements = {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      await client.createPaymentPayload(2, requirements);

      expect(mockSigner.signTypedData).toHaveBeenCalled();
      const callArgs = (mockSigner.signTypedData as any).mock.calls[0][0];
      expect(callArgs.domain.name).toBe("Permit2");
      expect(callArgs.domain.verifyingContract.toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase());
      expect(callArgs.domain.chainId).toBe(8453);
    });
  });
});

describe("Permit2 Helpers", () => {
  describe("createPermit2ApprovalTx", () => {
    it("should create approval transaction with correct structure", () => {
      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

      const result = createPermit2ApprovalTx(tokenAddress);

      expect(result.to.toLowerCase()).toBe(tokenAddress.toLowerCase());
      expect(result.data).toBeDefined();
      expect(result.data.startsWith("0x")).toBe(true);
    });

    it("should encode approve function selector correctly", () => {
      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

      const result = createPermit2ApprovalTx(tokenAddress);

      expect(result.data.slice(0, 10)).toBe("0x095ea7b3");
    });

    it("should include Permit2 address as spender in calldata", () => {
      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

      const result = createPermit2ApprovalTx(tokenAddress);

      const spenderParam = result.data.slice(10, 74);
      const spenderAddress = "0x" + spenderParam.slice(24);
      expect(spenderAddress.toLowerCase()).toBe(PERMIT2_ADDRESS.toLowerCase());
    });
  });

  describe("getPermit2AllowanceReadParams", () => {
    it("should return correct read parameters", () => {
      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const ownerAddress = "0x1234567890123456789012345678901234567890";
      const requiredAmount = BigInt(1000000);

      const result = getPermit2AllowanceReadParams({ tokenAddress, ownerAddress, requiredAmount });

      expect(result.address.toLowerCase()).toBe(tokenAddress.toLowerCase());
      expect(result.functionName).toBe("allowance");
      expect(result.args[1]).toBe(PERMIT2_ADDRESS);
    });
  });
});
