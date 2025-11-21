import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address } from "viem";
import { PaymentPayload, PaymentRequirements, ExactEvmPayload } from "../../../types/verify";
import { verify } from "./facilitator";
import { ERC_6492_MAGIC_BYTES } from "../../../shared/evm/constants";

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
      isErc6492?: boolean;
      signatureLength?: number;
      from?: Address;
    } = {},
  ): PaymentPayload => {
    const {
      isErc6492 = false,
      signatureLength = 130,
      from = "0xabcdef1234567890123456789012345678901234" as Address,
    } = options;

    let signature: string;
    if (isErc6492) {
      // Create ERC-6492 wrapped signature with magic suffix
      const baseLength = Math.max(signatureLength - 64, 66);
      signature = "0x" + "a".repeat(baseLength) + ERC_6492_MAGIC_BYTES;
    } else {
      signature = "0x" + "a".repeat(signatureLength);
    }

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("undeployed smart wallet detection", () => {
    it("should reject payment from undeployed smart wallet with ERC-6492 wrapped signature", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ isErc6492: true });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: (payload.payload as ExactEvmPayload).authorization.from,
      });
    });

    it("should reject payment when bytecode is undefined and has ERC-6492 signature", async () => {
      const client = createMockClient(undefined);
      const payload = createMockPayload({ isErc6492: true, signatureLength: 200 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: (payload.payload as ExactEvmPayload).authorization.from,
      });
    });

    it("should allow payment from EOA (standard 65-byte signature, no bytecode)", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 130 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should allow payment from deployed smart wallet with ERC-6492 signature", async () => {
      const client = createMockClient("0x608060405234801561001057600080fd5b50");
      const payload = createMockPayload({ isErc6492: true });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should allow payment from deployed smart wallet with any signature length", async () => {
      const client = createMockClient("0x608060405234801561001057600080fd5b50");
      const payload = createMockPayload({ signatureLength: 256 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should check bytecode at the correct payer address", async () => {
      const payerAddress = "0x9999999999999999999999999999999999999999" as Address;
      const client = createMockClient("0x");
      const payload = createMockPayload({ isErc6492: true, from: payerAddress });

      await verify(client, payload, mockPaymentRequirements);

      expect(client.getCode).toHaveBeenCalledWith({ address: payerAddress });
    });
  });

  describe("ERC-6492 magic suffix detection", () => {
    it("should reject undeployed wallet with signature ending in ERC-6492 magic bytes", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ isErc6492: true });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should allow undeployed wallet with long signature without magic suffix", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 300 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should allow standard EOA signature", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 130 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });
  });
});
