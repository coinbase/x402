import type {
  PaywallNetworkHandler,
  PaymentRequirements,
  PaymentRequired,
  PaywallConfig,
} from "../types";
import { getEvmPaywallHtml } from "./paywall";
import { EVM_NETWORKS, type EVMNetworkV1 } from "@x402/core/types";

/**
 * EVM paywall handler that supports EVM-based networks
 */
export const evmPaywall: PaywallNetworkHandler = {
  /**
   * Check if this handler supports the given payment requirement
   *
   * @param x402Version - The x402 protocol version
   * @param requirement - Payment requirement to check
   * @returns True if this handler can process this requirement
   */
  supports(x402Version: number, requirement: PaymentRequirements): boolean {
    const network = requirement.network;

    if (x402Version === 2) {
      // v2: CAIP-2 format (eip155:*)
      return network.startsWith("eip155:");
    }

    if (x402Version === 1) {
      // v1: legacy network names
      return EVM_NETWORKS.includes(network as EVMNetworkV1);
    }

    return false;
  },

  /**
   * Generate EVM-specific paywall HTML
   *
   * @param requirement - The selected payment requirement
   * @param paymentRequired - Full payment required response
   * @param config - Paywall configuration
   * @returns HTML string for the paywall page
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
