import { describe, it, expect, beforeEach, vi } from "vitest";
import { UptoEvmScheme } from "../../../src/upto/client/scheme";
import {
  createPermit2ApprovalTx,
  getPermit2AllowanceReadParams,
} from "../../../src/upto/client/permit2";
import type { ClientEvmSigner } from "../../../src/signer";
import { PaymentRequirements } from "@x402/core/types";
import { PERMIT2_ADDRESS, x402UptoPermit2ProxyAddress } from "../../../src/constants";
import { isUptoPermit2Payload } from "../../../src/types";

describe("UptoEvmScheme (Client)", () => {
  let client: UptoEvmScheme;
  let mockSigner: ClientEvmSigner;

  beforeEach(() => {
    mockSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature123456789"),
      readContract: vi.fn().mockResolvedValue(BigInt(0)),
    };
    client = new UptoEvmScheme(mockSigner);
  });

  describe("Construction", () => {
    it("should create instance with signer", () => {
      expect(client).toBeDefined();
      expect(client.scheme).toBe("upto");
    });
  });

  describe("createPaymentPayload", () => {
    it("should create Permit2 payload with correct structure", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);
      const payload = result.payload;

      expect(result.x402Version).toBe(2);
      expect(payload.signature).toBeDefined();
      expect(payload.permit2Authorization).toBeDefined();
      expect(isUptoPermit2Payload(payload)).toBe(true);
    });

    it("should set spender to x402UptoPermit2ProxyAddress", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.permit2Authorization.spender).toBe(x402UptoPermit2ProxyAddress);
    });

    it("should set witness.to to payTo address", async () => {
      const payToAddress = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: payToAddress,
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.permit2Authorization.witness.to.toLowerCase()).toBe(
        payToAddress.toLowerCase(),
      );
    });

    it("should use requirements.amount as permitted amount", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "2500000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.permit2Authorization.permitted.amount).toBe("2500000");
    });

    it("should use signer's address as from", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(result.payload.permit2Authorization.from).toBe(mockSigner.address);
    });

    it("should use Permit2 EIP-712 domain for signing", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      await client.createPaymentPayload(2, requirements);

      const callArgs = (mockSigner.signTypedData as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.domain.name).toBe("Permit2");
      expect(callArgs.domain.verifyingContract).toBe(PERMIT2_ADDRESS);
      expect(callArgs.primaryType).toBe("PermitWitnessTransferFrom");
    });

    it("should set deadline in the future based on maxTimeoutSeconds", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 600,
        extra: { assetTransferMethod: "permit2" },
      };

      const beforeTime = Math.floor(Date.now() / 1000) + 600;
      const result = await client.createPaymentPayload(2, requirements);
      const afterTime = Math.floor(Date.now() / 1000) + 600;

      const deadline = parseInt(result.payload.permit2Authorization.deadline);

      expect(deadline).toBeGreaterThanOrEqual(beforeTime);
      expect(deadline).toBeLessThanOrEqual(afterTime + 1);
    });

    it("should set validAfter to 10 minutes before current time", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const beforeTime = Math.floor(Date.now() / 1000) - 600;
      const result = await client.createPaymentPayload(2, requirements);
      const afterTime = Math.floor(Date.now() / 1000) - 600;

      const validAfter = parseInt(result.payload.permit2Authorization.witness.validAfter);

      expect(validAfter).toBeGreaterThanOrEqual(beforeTime);
      expect(validAfter).toBeLessThanOrEqual(afterTime + 1);
    });

    it("should generate unique nonces across calls", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result1 = await client.createPaymentPayload(2, requirements);
      const result2 = await client.createPaymentPayload(2, requirements);

      expect(result1.payload.permit2Authorization.nonce).not.toBe(
        result2.payload.permit2Authorization.nonce,
      );
    });

    it("should handle different networks", async () => {
      const ethereumRequirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:1",
        amount: "1000000",
        asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, ethereumRequirements);

      expect(result.x402Version).toBe(2);
      expect(result.payload.permit2Authorization).toBeDefined();
    });

    it("should call signTypedData on signer", async () => {
      const requirements: PaymentRequirements = {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: { assetTransferMethod: "permit2" },
      };

      const result = await client.createPaymentPayload(2, requirements);

      expect(mockSigner.signTypedData).toHaveBeenCalled();
      expect(result.payload.signature).toBeDefined();
    });
  });
});

describe("Permit2 Approval Helpers", () => {
  describe("createPermit2ApprovalTx", () => {
    it("should create approval transaction data", () => {
      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
      const tx = createPermit2ApprovalTx(tokenAddress);

      expect(tx.to.toLowerCase()).toBe(tokenAddress.toLowerCase());
      expect(tx.data).toBeDefined();
      expect(tx.data).toMatch(/^0x/);
    });

    it("should encode approve function call", () => {
      const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
      const tx = createPermit2ApprovalTx(tokenAddress);

      // approve(address,uint256) selector is 0x095ea7b3
      expect(tx.data.startsWith("0x095ea7b3")).toBe(true);
    });
  });

  describe("getPermit2AllowanceReadParams", () => {
    it("should return correct read parameters", () => {
      const params = getPermit2AllowanceReadParams({
        tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ownerAddress: "0x1234567890123456789012345678901234567890",
      });

      expect(params.address.toLowerCase()).toBe(
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase(),
      );
      expect(params.functionName).toBe("allowance");
      expect(params.args[0].toLowerCase()).toBe(
        "0x1234567890123456789012345678901234567890".toLowerCase(),
      );
      expect(params.args[1]).toBe(PERMIT2_ADDRESS);
    });

    it("should include allowance ABI", () => {
      const params = getPermit2AllowanceReadParams({
        tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ownerAddress: "0x1234567890123456789012345678901234567890",
      });

      expect(params.abi).toBeDefined();
      expect(params.abi[0].name).toBe("allowance");
    });
  });
});
