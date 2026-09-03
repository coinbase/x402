import { describe, it, expect, vi } from "vitest";
import { isAuthCapturePayload } from "@x402/evm";
import type { PaymentRequirements } from "@x402/core/types";
import { BaseScheme, type BaseClientSigner } from "../../../src/auth-capture/client/scheme";

/**
 * `BaseScheme` (auth-capture client) is a thin pass-through wrapper around
 * `@x402/evm`'s `AuthCaptureEvmScheme`. PaymentInfo hashing, salt derivation,
 * and signing details are covered by `@x402/evm`'s own test suite - these
 * tests only verify that the wrapper actually delegates (including its
 * validation behavior) and doesn't diverge from the underlying implementation.
 */
describe("BaseScheme (AuthCapture Client)", () => {
  const requirements: PaymentRequirements = {
    scheme: "auth-capture",
    network: "eip155:8453",
    amount: "1000000",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 300,
    extra: {
      name: "USD Coin",
      version: "2",
      captureAuthorizer: "0x9876543210987654321098765432109876543210",
      feeRecipient: "0x9876543210987654321098765432109876543210",
      captureDeadline: Math.floor(Date.now() / 1000) + 3600,
      refundDeadline: Math.floor(Date.now() / 1000) + 7200,
      minFeeBps: 0,
      maxFeeBps: 100,
    },
  };

  it("exposes scheme = 'auth-capture'", () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);
    expect(client.scheme).toBe("auth-capture");
  });

  it("delegates createPaymentPayload to the underlying AuthCaptureEvmScheme (EIP-3009)", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    const result = await client.createPaymentPayload(2, requirements);

    expect(isAuthCapturePayload(result.payload)).toBe(true);
    expect(result.payload).toHaveProperty("authorization");
    expect(mockSigner.signTypedData).toHaveBeenCalled();
  });

  it("delegates createPaymentPayload to the underlying AuthCaptureEvmScheme (Permit2)", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    const result = await client.createPaymentPayload(2, {
      ...requirements,
      extra: { ...requirements.extra, assetTransferMethod: "permit2" },
    });

    expect(isAuthCapturePayload(result.payload)).toBe(true);
    expect(result.payload).toHaveProperty("permit2Authorization");
  });

  it("propagates the underlying AuthCaptureEvmScheme's required `extra` field validation", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    await expect(client.createPaymentPayload(2, { ...requirements, extra: {} })).rejects.toThrow(
      /name/,
    );
  });

  it("propagates the underlying AuthCaptureEvmScheme's x402Version validation", async () => {
    const mockSigner: BaseClientSigner = {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
    const client = new BaseScheme(mockSigner);

    await expect(client.createPaymentPayload(1, requirements)).rejects.toThrow(
      /Unsupported x402Version/,
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
