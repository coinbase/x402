import { describe, it, expect, vi } from "vitest";
import type { SupportedKind } from "@x402/core/types";
import { BaseScheme } from "../../../src/batch-settlement/server/scheme";

/**
 * `BaseScheme` (batch-settlement server) is a thin pass-through wrapper around
 * `@x402/evm`'s `BatchSettlementEvmScheme`. Channel/voucher storage and settlement
 * enrichment details are covered by `@x402/evm`'s own test suite - these tests only
 * verify that the wrapper actually delegates and doesn't diverge from the
 * underlying implementation.
 */
describe("BaseScheme (Batch-Settlement Server)", () => {
  const receiverAddress = "0x1234567890123456789012345678901234567890" as const;

  it("exposes scheme = 'batch-settlement' and eip3009/permit2 as supported transfer methods", () => {
    const server = new BaseScheme(receiverAddress);
    expect(server.scheme).toBe("batch-settlement");
    expect(server.defaultAssetTransferMethod).toBe("eip3009");
    expect(server.paymentFlows.eip3009.default).toBe("authorization");
    expect(server.paymentFlows.permit2.default).toBe("authorization");
  });

  it("delegates getReceiverAddress and getWithdrawDelay to the underlying BatchSettlementEvmScheme", () => {
    const server = new BaseScheme(receiverAddress, { withdrawDelay: 1800 });
    expect(server.getReceiverAddress()).toBe(receiverAddress);
    expect(server.getWithdrawDelay()).toBe(1800);
  });

  it("delegates parsePrice to the underlying BatchSettlementEvmScheme (Base Sepolia USDC)", async () => {
    const server = new BaseScheme(receiverAddress);
    const result = await server.parsePrice("$1.00", "eip155:84532");
    expect(result.asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(result.amount).toBe("1000000");
  });

  it("delegates registerMoneyParser to the underlying BatchSettlementEvmScheme and returns `this` for chaining", async () => {
    const server = new BaseScheme(receiverAddress);
    const returned = server.registerMoneyParser(async () => ({
      amount: "42",
      asset: "0xCustomToken",
    }));
    expect(returned).toBe(server);

    const result = await server.parsePrice("$1.00", "eip155:84532");
    expect(result).toEqual({ amount: "42", asset: "0xCustomToken" });
  });

  it("delegates enhancePaymentRequirements to the underlying BatchSettlementEvmScheme (receiverAuthorizer + withdrawDelay)", async () => {
    const authorizerSigner = {
      address: "0x9876543210987654321098765432109876543210" as const,
      signTypedData: vi.fn().mockResolvedValue("0xmocksignature" as const),
    };
    const server = new BaseScheme(receiverAddress, {
      receiverAuthorizerSigner: authorizerSigner,
      withdrawDelay: 900,
    });

    const enhanced = await server.enhancePaymentRequirements(
      {
        scheme: "batch-settlement",
        network: "eip155:84532",
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: receiverAddress,
        maxTimeoutSeconds: 3600,
        extra: { name: "USDC", version: "2" },
      },
      { x402Version: 2, scheme: "batch-settlement", network: "eip155:84532" },
      [],
    );

    expect(enhanced.extra?.receiverAuthorizer).toBe("0x9876543210987654321098765432109876543210");
    expect(enhanced.extra?.withdrawDelay).toBe(900);
  });

  it("propagates the underlying BatchSettlementEvmScheme's non-zero receiverAuthorizer requirement", async () => {
    const server = new BaseScheme(receiverAddress);

    await expect(
      server.enhancePaymentRequirements(
        {
          scheme: "batch-settlement",
          network: "eip155:84532",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: receiverAddress,
          maxTimeoutSeconds: 3600,
          extra: { name: "USDC", version: "2" },
        },
        { x402Version: 2, scheme: "batch-settlement", network: "eip155:84532" },
        [],
      ),
    ).rejects.toThrow(/receiverAuthorizer/);
  });

  it("rejects parsePrice for a network outside Base's scope", async () => {
    const server = new BaseScheme(receiverAddress);
    await expect(server.parsePrice("$1.00", "eip155:1")).rejects.toThrow(/eip155:1/);
  });

  it("rejects enhancePaymentRequirements for a network outside Base's scope", async () => {
    const server = new BaseScheme(receiverAddress);
    await expect(
      server.enhancePaymentRequirements(
        {
          scheme: "batch-settlement",
          network: "eip155:1",
          amount: "1000000",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: receiverAddress,
          maxTimeoutSeconds: 3600,
          extra: { name: "USDC", version: "2" },
        },
        { x402Version: 2, scheme: "batch-settlement", network: "eip155:1" },
        [],
      ),
    ).rejects.toThrow(/eip155:1/);
  });

  it("rejects createChannelManager for a network outside Base's scope", () => {
    const server = new BaseScheme(receiverAddress);
    expect(() => server.createChannelManager({} as never, "eip155:1")).toThrow(/eip155:1/);
  });

  it("returns undefined from getAssetDecimals for a network outside Base's scope", () => {
    const server = new BaseScheme(receiverAddress);
    expect(
      server.getAssetDecimals("0x036CbD53842c5426634e7929541eC2318f3dCF7e", "eip155:1"),
    ).toBeUndefined();
  });

  it("returns a problem string from validateFacilitatorSupport for a network outside Base's scope", () => {
    const server = new BaseScheme(receiverAddress);
    const supportedKind: SupportedKind = {
      x402Version: 2,
      scheme: "batch-settlement",
      network: "eip155:1",
    };
    expect(server.validateFacilitatorSupport("eip155:1", supportedKind, [])).toMatch(/eip155:1/);
  });

  it("still composes the underlying BatchSettlementEvmScheme's receiverAuthorizer check on Base", () => {
    const server = new BaseScheme(receiverAddress);
    const supportedKind: SupportedKind = {
      x402Version: 2,
      scheme: "batch-settlement",
      network: "eip155:84532",
    };
    // No receiverAuthorizerSigner configured and no facilitator-advertised
    // receiverAuthorizer - the underlying BatchSettlementEvmScheme's own check fires.
    expect(server.validateFacilitatorSupport("eip155:84532", supportedKind, [])).toMatch(
      /receiverAuthorizer/,
    );
  });
});
