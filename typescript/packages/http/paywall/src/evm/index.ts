import type {
  PaywallNetworkHandler,
  PaymentRequirements,
  PaymentRequired,
  PaywallConfig,
} from "../types";
import { getEvmPaywallHtml } from "./paywall";

/**
 * EVM paywall handler that supports EVM-based networks
 */
export const evmPaywall: PaywallNetworkHandler = {
  /**
   * Check if this handler supports the given payment requirement
   */
  supports(requirement: PaymentRequirements): boolean {
    const network = requirement.network;

    // Support v2 CAIP-2 format (eip155:*)
    if (network.startsWith("eip155:")) {
      return true;
    }

    // Support v1 legacy EVM networks
    const evmNetworks = [
      "base",
      "base-sepolia",
      "abstract",
      "abstract-testnet",
      "avalanche",
      "avalanche-fuji",
      "iotex",
      "sei",
      "sei-testnet",
      "polygon",
      "polygon-amoy",
      "peaq",
    ];

    return evmNetworks.includes(network);
  },

  /**
   * Generate EVM-specific paywall HTML
   */
  generateHtml(
    requirement: PaymentRequirements,
    paymentRequired: PaymentRequired,
    config: PaywallConfig,
  ): string {
    // Calculate display amount
    const amount = requirement.amount
      ? parseFloat(requirement.amount) / 1000000
      : requirement.maxAmountRequired
        ? parseFloat(requirement.maxAmountRequired) / 1000000
        : 0;

    return getEvmPaywallHtml({
      amount,
      paymentRequirements: [requirement],
      currentUrl: paymentRequired.resource?.url || config.currentUrl || "",
      testnet: config.testnet ?? true,
      cdpClientKey: config.cdpClientKey,
      appName: config.appName,
      appLogo: config.appLogo,
      sessionTokenEndpoint: config.sessionTokenEndpoint,
    });
  },
};

// Also export components for custom UI builders
export { EvmPaywall } from "./EvmPaywall";
