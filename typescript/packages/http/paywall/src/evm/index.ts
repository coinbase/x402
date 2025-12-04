import type {
  PaywallNetworkHandler,
  PaymentRequirements,
  PaymentRequired,
  PaywallConfig,
} from "../types";
import { getEvmPaywallHtml } from "./paywall";

/**
 * EVM paywall handler that supports EVM-based networks (CAIP-2 format only)
 */
export const evmPaywall: PaywallNetworkHandler = {
  /**
   * Check if this handler supports the given payment requirement
   *
   * @param requirement - Payment requirement to check
   * @returns True if this handler can process this requirement
   */
  supports(requirement: PaymentRequirements): boolean {
    return requirement.network.startsWith("eip155:");
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
    const amount = requirement.amount
      ? parseFloat(requirement.amount) / 1000000
      : requirement.maxAmountRequired
        ? parseFloat(requirement.maxAmountRequired) / 1000000
        : 0;

    return getEvmPaywallHtml({
      amount,
      paymentRequired,
      currentUrl: paymentRequired.resource?.url || config.currentUrl || "",
      testnet: config.testnet ?? true,
      appName: config.appName,
      appLogo: config.appLogo,
    });
  },
};
