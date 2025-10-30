import type {
  PaywallNetworkHandler,
  PaymentRequirements,
  PaymentRequired,
  PaywallConfig,
} from "../types";
import { getSvmPaywallHtml } from "./paywall";

/**
 * SVM paywall handler that supports Solana-based networks
 */
export const svmPaywall: PaywallNetworkHandler = {
  /**
   * Check if this handler supports the given payment requirement
   */
  supports(requirement: PaymentRequirements): boolean {
    const network = requirement.network;

    // Support v2 CAIP-2 format (solana:*)
    if (network.startsWith("solana:")) {
      return true;
    }

    // Support v1 legacy Solana networks
    const svmNetworks = ["solana", "solana-devnet"];

    return svmNetworks.includes(network);
  },

  /**
   * Generate SVM-specific paywall HTML
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
