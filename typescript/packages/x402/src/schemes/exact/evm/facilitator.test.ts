import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address } from "viem";
import { PaymentPayload, PaymentRequirements, ExactEvmPayload } from "../../../types/verify";
import { verify } from "./facilitator";

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
      signatureLength?: number;
      from?: Address;
    } = {},
  ): PaymentPayload => {
    const {
      signatureLength = 130,
      from = "0xabcdef1234567890123456789012345678901234" as Address,
    } = options;

    const signature = "0x" + "a".repeat(signatureLength);

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

  describe("smart wallet detection (signature length > 130)", () => {
    it("should reject undeployed smart wallet when bytecode is 0x", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 200 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: (payload.payload as ExactEvmPayload).authorization.from,
      });
    });

    it("should reject undeployed smart wallet when bytecode is undefined", async () => {
      const client = createMockClient(undefined);
      const payload = createMockPayload({ signatureLength: 200 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result).toEqual({
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_undeployed_smart_wallet",
        payer: (payload.payload as ExactEvmPayload).authorization.from,
      });
    });

    it("should allow payment from EOA with standard signature length", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 130 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should allow payment from deployed smart wallet", async () => {
      const client = createMockClient("0x608060405234801561001057600080fd5b50");
      const payload = createMockPayload({ signatureLength: 256 });

      const result = await verify(client, payload, mockPaymentRequirements);

      expect(result.invalidReason).not.toBe("invalid_exact_evm_payload_undeployed_smart_wallet");
    });

    it("should NOT check bytecode for EOA signatures", async () => {
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 130 });

      await verify(client, payload, mockPaymentRequirements);

      expect(client.getCode).not.toHaveBeenCalled();
    });

    it("should check bytecode for smart wallet signatures", async () => {
      const payerAddress = "0x9999999999999999999999999999999999999999" as Address;
      const client = createMockClient("0x");
      const payload = createMockPayload({ signatureLength: 200, from: payerAddress });

      await verify(client, payload, mockPaymentRequirements);

      expect(client.getCode).toHaveBeenCalledWith({ address: payerAddress });
    });
  });
});
