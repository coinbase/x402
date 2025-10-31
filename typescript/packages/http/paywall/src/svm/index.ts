import type {
  PaywallNetworkHandler,
  PaymentRequirements,
  PaymentRequired,
  PaywallConfig,
} from "../types";
import { getSvmPaywallHtml } from "./paywall";
import { SVM_NETWORKS, type SVMNetworkV1 } from "@x402/core/types";

/**
 * SVM paywall handler that supports Solana-based networks
 */
export const svmPaywall: PaywallNetworkHandler = {
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
      // v2: CAIP-2 format (solana:*)
      return network.startsWith("solana:");
    }

    if (x402Version === 1) {
      // v1: legacy network names
      return SVM_NETWORKS.includes(network as SVMNetworkV1);
    }

    return false;
  },

  /**
   * Generate SVM-specific paywall HTML
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

    return getSvmPaywallHtml({
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
export { SolanaPaywall } from "./SolanaPaywall";
