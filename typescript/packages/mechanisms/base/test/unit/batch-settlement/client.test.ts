import { describe, it, expect, vi } from "vitest";
import type { PaymentRequirements } from "@x402/core/types";
import { BaseScheme, type BaseClientSigner } from "../../../src/batch-settlement/client/scheme";

/**
 * `BaseScheme` (batch-settlement client) is a thin pass-through wrapper around
 * `@x402/evm`'s `BatchSettlementEvmScheme`. Deposit sizing, voucher signing, channel
 * recovery, and refund mechanics are covered by `@x402/evm`'s own test suite - these
 * tests only verify that the wrapper actually delegates and doesn't diverge from the
 * underlying implementation.
 */
describe("BaseScheme (Batch-Settlement Client)", () => {
  const requirements: PaymentRequirements = {
    scheme: "batch-settlement",
    network: "eip155:84532",
    amount: "1000000",
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    payTo: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    maxTimeoutSeconds: 3600,
    extra: {
      name: "USDC",
      version: "2",
      receiverAuthorizer: "0x9876543210987654321098765432109876543210",
    },
  };

  function buildMockSigner(): BaseClientSigner {
    return {
      address: "0x1234567890123456789012345678901234567890",
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature"),
    };
  }

  it("exposes scheme = 'batch-settlement'", () => {
    const client = new BaseScheme(buildMockSigner());
    expect(client.scheme).toBe("batch-settlement");
  });

  it("exposes schemeHooks from the underlying BatchSettlementEvmScheme", () => {
    const client = new BaseScheme(buildMockSigner());
    expect(client.schemeHooks).toBeDefined();
  });

  it("delegates buildChannelConfig to the underlying BatchSettlementEvmScheme", () => {
    const signer = buildMockSigner();
    const client = new BaseScheme(signer);

    const config = client.buildChannelConfig(requirements);

    expect(config.payer).toBe(signer.address);
    expect(config.receiver).toBe(requirements.payTo);
    expect(config.token).toBe(requirements.asset);
  });

  it("delegates createPaymentPayload to the underlying BatchSettlementEvmScheme (initial deposit + voucher bundle)", async () => {
    const signer = buildMockSigner();
    const client = new BaseScheme(signer);

    const result = await client.createPaymentPayload(2, requirements);

    const payload = result.payload as { type: string; deposit?: unknown; voucher?: unknown };
    expect(payload.type).toBe("deposit");
    expect(payload.deposit).toBeDefined();
    expect(payload.voucher).toBeDefined();
    expect(signer.signTypedData).toHaveBeenCalled();
  });

  it("propagates the underlying BatchSettlementEvmScheme's required EIP-712 domain validation", async () => {
    const client = new BaseScheme(buildMockSigner());

    await expect(
      client.createPaymentPayload(2, {
        ...requirements,
        extra: { receiverAuthorizer: "0x9876543210987654321098765432109876543210" },
      }),
    ).rejects.toThrow(/name, version/);
  });

  it("rejects createPaymentPayload for a network outside Base's scope", async () => {
    const client = new BaseScheme(buildMockSigner());

    await expect(
      client.createPaymentPayload(2, { ...requirements, network: "eip155:1" }),
    ).rejects.toThrow(/eip155:1/);
  });

  it("rejects buildChannelConfig for a network outside Base's scope", () => {
    const client = new BaseScheme(buildMockSigner());

    expect(() => client.buildChannelConfig({ ...requirements, network: "eip155:1" })).toThrow(
      /eip155:1/,
    );
  });
});
