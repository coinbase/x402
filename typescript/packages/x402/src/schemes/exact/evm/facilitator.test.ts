import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address, Chain, Transport } from "viem";
import { PaymentPayload, PaymentRequirements, ExactEvmPayload } from "../../../types/verify";
import { verify, settle } from "./facilitator";
import type { SignerWallet } from "../../../types/shared/evm";

vi.mock("../../../shared", () => ({
  getNetworkId: vi.fn().mockReturnValue(84532),
}));

vi.mock("../../../shared/evm", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getVersion: vi.fn().mockResolvedValue("2"),
    getERC20Balance: vi.fn().mockResolvedValue(BigInt("2000000")),
  };
});

vi.mock("viem", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    parseErc6492Signature: vi.fn((sig: string) => ({ signature: sig })),
    parseSignature: vi.fn(() => ({
      r: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`,
      s: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`,
      v: 27,
      yParity: 0,
    })),
  };
});

describe("facilitator - smart wallet deployment check", () => {
  const mockPaymentRequirements: PaymentRequirements = {
    scheme: "exact",
    network: "base-sepolia",
    maxAmountRequired: "1000000",
    resource: "https://example.com/resource",
    description: "Test resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890" as Address,
    maxTimeoutSeconds: 300,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
  };

  const createMockPayload = (
    options: {
      signatureLength?: number;
      from?: Address;
    } = {},
  ): PaymentPayload => {
    const {
      signatureLength = 130,
      from = "0xabcdef1234567890123456789012345678901234" as Address,
    } = options;

    // Create a valid signature format: 65 bytes for standard EOA (r=32, s=32, v=1)
    // For longer signatures (smart wallets), just pad with zeros
    const baseSignature =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b";
    const signature =
      signatureLength > 130 ? baseSignature + "0".repeat(signatureLength - 130) : baseSignature;

    return {
      x402Version: 1,
      scheme: "exact",
      network: "base-sepolia",
      payload: {
        signature: signature as `0x${string}`,
        authorization: {
          from,
          to: mockPaymentRequirements.payTo,
          value: mockPaymentRequirements.maxAmountRequired,
          validAfter: (Math.floor(Date.now() / 1000) - 600).toString(),
          validBefore: (Math.floor(Date.now() / 1000) + 300).toString(),
          nonce: "0x1234567890abcdef",
        },
      } as ExactEvmPayload,
    };
  };

  const createMockClient = (bytecode: string | undefined) => {
    return {
      getCode: vi.fn().mockResolvedValue(bytecode),
      verifyTypedData: vi.fn().mockResolvedValue(true),
      chain: { id: 84532 },
    } as unknown as ReturnType<typeof import("../../../types/shared/evm").createConnectedClient>;
  };

  const createMockWallet = (bytecode: string | undefined) => {
    return {
      getCode: vi.fn().mockResolvedValue(bytecode),
      verifyTypedData: vi.fn().mockResolvedValue(true),
      writeContract: vi.fn().mockResolvedValue("0xtxhash"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
      chain: { id: 84532 },
      account: { address: "0x1234567890123456789012345678901234567890" as Address },
    } as unknown as SignerWallet<Chain, Transport>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verify - accepts EIP-6492 signatures from undeployed wallets", () => {
    it("should accept undeployed smart wallet signatures (EIP-6492)", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 200 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.isValid).toBe(true);
      expect(result.invalidReason).toBeUndefined();
    });

    it("should NOT check bytecode during verification", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 200 });

      await verify(client, payload, mockPaymentRequirements);

      expect(client.getCode).not.toHaveBeenCalled();
    });
  });

  describe("settle - smart wallet deployment check", () => {
    it("should reject undeployed smart wallet during settlement when bytecode is 0x", async () => {
      const wallet = createMockWallet("0x");
      const payload = createMockPayload({ signatureLength: 200 });

      const result = await settle(wallet, payload, mockPaymentRequirements);

      expect(result).toEqual({
        success: false,
        network: "base-sepolia",
        transaction: "",
        errorReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: (payload.payload as ExactEvmPayload).authorization.from,
      });
      expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("should reject undeployed smart wallet during settlement when bytecode is undefined", async () => {
      const wallet = createMockWallet(undefined);
      const payload = createMockPayload({ signatureLength: 200 });

      const result = await settle(wallet, payload, mockPaymentRequirements);

      expect(result).toEqual({
        success: false,
        network: "base-sepolia",
        transaction: "",
        errorReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: (payload.payload as ExactEvmPayload).authorization.from,
      });
      expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("should allow settlement from deployed smart wallet", async () => {
      const wallet = createMockWallet("0x608060405234801561001057600080fd5b50");
      const payload = createMockPayload({ signatureLength: 256 });

      const result = await settle(wallet, payload, mockPaymentRequirements);

      expect(result.success).toBe(true);
      expect(wallet.writeContract).toHaveBeenCalled();
    });

    it("should NOT check bytecode for EOA signatures during settlement", async () => {
      const wallet = createMockWallet("0x");
      const payload = createMockPayload({ signatureLength: 130 });

      await settle(wallet, payload, mockPaymentRequirements);

      expect(wallet.writeContract).toHaveBeenCalled();
    });

    it("should check bytecode for smart wallet signatures during settlement", async () => {
      const payerAddress = "0x9999999999999999999999999999999999999999" as Address;
      const wallet = createMockWallet("0x608060405234801561001057600080fd5b50");
      const payload = createMockPayload({ signatureLength: 200, from: payerAddress });

      await settle(wallet, payload, mockPaymentRequirements);

      expect(wallet.getCode).toHaveBeenCalledWith({ address: payerAddress });
    });
  });
});
