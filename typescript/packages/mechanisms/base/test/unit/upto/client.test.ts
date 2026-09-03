import { describe, it, expect, vi } from "vitest";
import { isUptoPermit2Payload } from "@x402/evm";
import type { PaymentRequirements } from "@x402/core/types";
import { BaseScheme, type BaseClientSigner } from "../../../src/upto/client/scheme";

/**
 * `BaseScheme` (upto client) is a thin pass-through wrapper around `@x402/evm`'s
 * `UptoEvmScheme`. Permit2 signing details, extension enrichment, etc. are covered
 * by `@x402/evm`'s own test suite - these tests only verify that the wrapper actually
 * delegates and doesn't diverge from the underlying implementation.
 */
describe("BaseScheme (Upto Client)", () => {
  const requirements: PaymentRequirements = {
    scheme: "upto",
    network: "eip155:8453",
    amount: "1000000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
    maxTimeoutSeconds: 300,
    extra: { facilitatorAddress: "0x8135968F909911fA035BCbbdd5458811820E2abd" },
  };

  it("exposes scheme = 'upto'", () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);
    expect(client.scheme).toBe("upto");
  });

  it("delegates createPaymentPayload to the underlying UptoEvmScheme (Permit2)", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    const result = await client.createPaymentPayload(2, requirements);

    expect(isUptoPermit2Payload(result.payload)).toBe(true);
    expect(mockSigner.signTypedData).toHaveBeenCalled();
  });

  it("propagates the underlying UptoEvmScheme's facilitatorAddress requirement", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    await expect(client.createPaymentPayload(2, { ...requirements, extra: {} })).rejects.toThrow(
      /facilitatorAddress/,
    );
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
