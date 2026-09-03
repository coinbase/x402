import { describe, it, expect, vi } from "vitest";
import { isEIP3009Payload, isPermit2Payload, type ExactEvmPayloadV2 } from "@x402/evm";
import type { PaymentRequirements } from "@x402/core/types";
import { BaseScheme, type BaseClientSigner } from "../../../src/exact/client/scheme";

/**
 * `BaseScheme` (client) is a thin pass-through wrapper around `@x402/evm`'s
 * `ExactEvmScheme`. EIP-3009 / Permit2 signing details, extension enrichment, etc.
 * are covered by `@x402/evm`'s own test suite - these tests only verify that the
 * wrapper actually delegates and doesn't diverge from the underlying implementation.
 */
describe("BaseScheme (Client)", () => {
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: "eip155:8453",
    amount: "1000000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    maxTimeoutSeconds: 300,
    extra: { name: "USD Coin", version: "2" },
  };

  it("exposes scheme = 'exact'", () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);
    expect(client.scheme).toBe("exact");
  });

  it("delegates createPaymentPayload to the underlying ExactEvmScheme (EIP-3009)", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    const result = await client.createPaymentPayload(2, requirements);
    const payload = result.payload as unknown as ExactEvmPayloadV2;

    expect(isEIP3009Payload(payload)).toBe(true);
    if (isEIP3009Payload(payload)) {
      expect(payload.authorization.from).toBe(mockSigner.address);
    }
    expect(mockSigner.signTypedData).toHaveBeenCalled();
  });

  it("delegates createPaymentPayload to the underlying ExactEvmScheme (Permit2)", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    const result = await client.createPaymentPayload(2, {
      ...requirements,
      extra: { ...requirements.extra, assetTransferMethod: "permit2" },
    });

    expect(isPermit2Payload(result.payload as unknown as ExactEvmPayloadV2)).toBe(true);
  });

  it("rejects createPaymentPayload for a network outside Base's scope", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    await expect(
      client.createPaymentPayload(2, { ...requirements, network: "eip155:1" }),
    ).rejects.toThrow(/eip155:1/);
  });
});
