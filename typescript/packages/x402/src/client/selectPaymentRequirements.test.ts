import { describe, it, expect } from "vitest";
import { selectPaymentRequirements } from "./selectPaymentRequirements";
import { PaymentRequirements, Network } from "../types";
import { getUsdcChainConfigForChain } from "../shared/evm";
import { getNetworkId } from "../shared/network";

/**
 * Test helper to create a payment requirement with the given network, asset, and overrides.
 *
 * @param network - The network to create the payment requirement for.
 * @param asset - The asset to create the payment requirement for.
 * @param overrides - The overrides to apply to the payment requirement.
 * @returns The created payment requirement.
 */
function makeRequirement(
  network: Network,
  asset: string,
  overrides: Partial<PaymentRequirements> = {},
): PaymentRequirements {
  return {
    scheme: "exact",
    network,
    maxAmountRequired: "1000",
    resource: "https://example.com/resource",
    description: "Test",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 300,
    asset,
    ...overrides,
  };
}

describe("selectPaymentRequirements", () => {
  it("prioritizes a USDC requirement over non-USDC, regardless of order", () => {
    const avalancheUsdc = getUsdcChainConfigForChain(getNetworkId("avalanche"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      makeRequirement("avalanche", avalancheUsdc),
      makeRequirement("base", "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
    ];

    const selected = selectPaymentRequirements(reqs);
    expect(selected.network).toBe("avalanche");
    expect(selected.asset).toBe(avalancheUsdc);
  });

  it("prefers Base network when no USDC requirement exists", () => {
    const reqs: PaymentRequirements[] = [
      makeRequirement("avalanche", "0x1111111111111111111111111111111111111111"),
      makeRequirement("base", "0x2222222222222222222222222222222222222222"),
    ];

    const selected = selectPaymentRequirements(reqs);
    expect(selected.network).toBe("base");
  });

  it("returns the first USDC requirement when multiple are available, respecting Base priority", () => {
    const baseUsdc = getUsdcChainConfigForChain(getNetworkId("base"))!.usdcAddress as string;
    const avalancheUsdc = getUsdcChainConfigForChain(getNetworkId("avalanche"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      makeRequirement("avalanche", avalancheUsdc),
      makeRequirement("base", baseUsdc),
    ];

    const selected = selectPaymentRequirements(reqs);
    // Base is sorted to the front and both are USDC; the first USDC after sorting will be Base
    expect(selected.network).toBe("base");
    expect(selected.asset).toBe(baseUsdc);
  });

  it("filters by a specific network and selects USDC within that network", () => {
    const avalancheUsdc = getUsdcChainConfigForChain(getNetworkId("avalanche"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      makeRequirement("base", "0x3333333333333333333333333333333333333333"),
      makeRequirement("avalanche", avalancheUsdc),
    ];

    const selected = selectPaymentRequirements(reqs, "avalanche");
    expect(selected.network).toBe("avalanche");
    expect(selected.asset).toBe(avalancheUsdc);
  });

  it("filters by a list of networks and prefers Base USDC if present", () => {
    const baseUsdc = getUsdcChainConfigForChain(getNetworkId("base"))!.usdcAddress as string;
    const avalancheUsdc = getUsdcChainConfigForChain(getNetworkId("avalanche"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      makeRequirement("avalanche", avalancheUsdc),
      makeRequirement("base", baseUsdc),
    ];

    const selected = selectPaymentRequirements(reqs, ["base", "avalanche"]);
    expect(selected.network).toBe("base");
    expect(selected.asset).toBe(baseUsdc);
  });

  it("filters by ['solana', 'solana-devnet'] and selects the USDC requirement among them", () => {
    const solanaUsdc = getUsdcChainConfigForChain(getNetworkId("solana"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      // Non-matching network should be ignored
      makeRequirement("base", "0x9999999999999999999999999999999999999999"),
      makeRequirement("solana", solanaUsdc),
      makeRequirement("solana-devnet", "SomeNonUsdcTokenAddress"),
    ];

    const selected = selectPaymentRequirements(reqs, ["solana", "solana-devnet"]);
    expect(selected.network).toBe("solana");
    expect(selected.asset).toBe(solanaUsdc);
  });

  it("filters by ['solana', 'solana-devnet'] and when both are USDC, returns the first in input order", () => {
    const solanaUsdc = getUsdcChainConfigForChain(getNetworkId("solana"))!.usdcAddress as string;
    const solanaDevnetUsdc = getUsdcChainConfigForChain(getNetworkId("solana-devnet"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      makeRequirement("solana-devnet", solanaDevnetUsdc),
      makeRequirement("solana", solanaUsdc),
    ];

    const selected = selectPaymentRequirements(reqs, ["solana", "solana-devnet"]);
    // Neither is 'base', so original order is preserved; first USDC is solana-devnet
    expect(selected.network).toBe("solana-devnet");
    expect(selected.asset).toBe(solanaDevnetUsdc);
  });

  it("filters by ['solana', 'solana-devnet'] and when neither is USDC, returns the first broadly accepted", () => {
    const reqs: PaymentRequirements[] = [
      makeRequirement("solana-devnet", "NotUsdcDevnet"),
      makeRequirement("solana", "NotUsdcMainnet"),
    ];

    const selected = selectPaymentRequirements(reqs, ["solana", "solana-devnet"]);
    expect(selected.network).toBe("solana-devnet");
  });

  it("falls back to the first broadly accepted requirement when no USDC exists", () => {
    const reqs: PaymentRequirements[] = [
      makeRequirement("avalanche", "0x4444444444444444444444444444444444444444"),
      makeRequirement("base", "0x5555555555555555555555555555555555555555"),
    ];

    const selected = selectPaymentRequirements(reqs, ["base", "avalanche"]);
    // Base is sorted to the front and both match the accepted networks
    expect(selected.network).toBe("base");
  });

  it("when no broadly accepted requirement exists, returns the first (Base prioritized)", () => {
    const reqs: PaymentRequirements[] = [
      makeRequirement("avalanche", "0x6666666666666666666666666666666666666666"),
      makeRequirement("base", "0x7777777777777777777777777777777777777777"),
    ];

    const selected = selectPaymentRequirements(reqs, "solana");
    // No matches for solana; function returns the first element after the Base-priority sort
    expect(selected.network).toBe("base");
  });

  it("supports SVM networks by matching their USDC asset", () => {
    const solanaUsdc = getUsdcChainConfigForChain(getNetworkId("solana"))!.usdcAddress as string;
    const reqs: PaymentRequirements[] = [
      makeRequirement("solana", solanaUsdc),
      makeRequirement("base", "0x8888888888888888888888888888888888888888"),
    ];

    const selected = selectPaymentRequirements(reqs);
    expect(selected.network).toBe("solana");
    expect(selected.asset).toBe(solanaUsdc);
  });
});


