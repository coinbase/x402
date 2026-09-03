import { describe, it, expect } from "vitest";
import type { SupportedKind } from "@x402/core/types";
import { BaseScheme } from "../../../src/upto/server/scheme";

/**
 * `BaseScheme` (upto server) is a thin pass-through wrapper around `@x402/evm`'s
 * `UptoEvmScheme`. Pricing/asset conversion details are covered by `@x402/evm`'s own
 * test suite - these tests only verify that the wrapper actually delegates and
 * doesn't diverge from the underlying implementation.
 */
describe("BaseScheme (Upto Server)", () => {
  it("exposes scheme = 'upto' and permit2 as the (only) transfer method", () => {
    const server = new BaseScheme();
    expect(server.scheme).toBe("upto");
    expect(server.defaultAssetTransferMethod).toBe("permit2");
    expect(server.paymentFlows.permit2.default).toBe("authorization");
  });

  it("delegates parsePrice to the underlying UptoEvmScheme (Base mainnet USDC)", async () => {
    const server = new BaseScheme();
    const result = await server.parsePrice("$1.00", "eip155:8453");
    expect(result.asset).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(result.amount).toBe("1000000");
    expect(result.extra?.assetTransferMethod).toBe("permit2");
  });

  it("delegates enhancePaymentRequirements to the underlying UptoEvmScheme (facilitatorAddress)", async () => {
    const server = new BaseScheme();
    const enhanced = await server.enhancePaymentRequirements(
      {
        scheme: "upto",
        network: "eip155:8453",
        amount: "1000000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        maxTimeoutSeconds: 300,
        extra: {},
      },
      {
        x402Version: 2,
        scheme: "upto",
        network: "eip155:8453",
        // Already EIP-55 checksummed, so the underlying getAddress() call is a no-op.
        extra: { facilitatorAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
      },
      [],
    );
    expect(enhanced.extra?.facilitatorAddress).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(enhanced.extra?.assetTransferMethod).toBe("permit2");
  });

  it("delegates registerMoneyParser to the underlying UptoEvmScheme", async () => {
    const server = new BaseScheme();
    server.registerMoneyParser(async () => ({ amount: "42", asset: "0xCustomToken" }));

    const result = await server.parsePrice("$1.00", "eip155:8453");
    expect(result).toEqual({ amount: "42", asset: "0xCustomToken" });
  });

  it("rejects parsePrice for a network outside Base's scope", async () => {
    const server = new BaseScheme();
    await expect(server.parsePrice("$1.00", "eip155:1")).rejects.toThrow(/eip155:1/);
  });

  it("rejects enhancePaymentRequirements for a network outside Base's scope", async () => {
    const server = new BaseScheme();
    await expect(
      server.enhancePaymentRequirements(
        {
          scheme: "upto",
          network: "eip155:1",
          amount: "1000000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
          maxTimeoutSeconds: 300,
          extra: {},
        },
        { x402Version: 2, scheme: "upto", network: "eip155:1" },
        [],
      ),
    ).rejects.toThrow(/eip155:1/);
  });

  it("returns undefined from getAssetDecimals for a network outside Base's scope", () => {
    const server = new BaseScheme();
    expect(
      server.getAssetDecimals("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "eip155:1"),
    ).toBeUndefined();
  });

  it("returns a problem string from validateFacilitatorSupport for a network outside Base's scope", () => {
    const server = new BaseScheme();
    const supportedKind: SupportedKind = { x402Version: 2, scheme: "upto", network: "eip155:1" };
    expect(server.validateFacilitatorSupport?.("eip155:1", supportedKind, [])).toMatch(/eip155:1/);
  });

  it("returns void from validateFacilitatorSupport for a Base network", () => {
    const server = new BaseScheme();
    const supportedKind: SupportedKind = {
      x402Version: 2,
      scheme: "upto",
      network: "eip155:8453",
    };
    expect(server.validateFacilitatorSupport?.("eip155:8453", supportedKind, [])).toBeUndefined();
  });
});
