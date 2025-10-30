import { getPaywallHtml } from "./paywall";
import type { PaywallConfig, PaywallProvider, PaymentRequired, PaywallNetworkHandler } from "./types";

/**
 * Builder for creating configured paywall providers
 */
export class PaywallBuilder {
  private config: PaywallConfig = {};
  private handlers: PaywallNetworkHandler[] = [];

  /**
   * Register a network-specific paywall handler
   *
   * @param handler - Network handler to register
   * @returns This builder instance for chaining
   */
  withNetwork(handler: PaywallNetworkHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /**
   * Set configuration options for the paywall
   *
   * @param config - Paywall configuration options
   * @returns This builder instance for chaining
   */
  withConfig(config: PaywallConfig): this {
    this.config = { ...this.config, ...config };
    return this;
  }

  /**
   * Build the paywall provider
   *
   * @returns A configured PaywallProvider instance
   */
  build(): PaywallProvider {
    const builderConfig = this.config;
    const handlers = this.handlers;

    return {
      generateHtml: (paymentRequired: PaymentRequired, runtimeConfig?: PaywallConfig): string => {
        // Merge builder config with runtime config (runtime takes precedence)
        const finalConfig = { ...builderConfig, ...runtimeConfig };

        // If network handlers are registered, use first-match selection
        if (handlers.length > 0) {
          for (const requirement of paymentRequired.accepts) {
            const handler = handlers.find(h => h.supports(requirement));
            if (handler) {
              return handler.generateHtml(requirement, paymentRequired, finalConfig);
            }
          }
          // No handler matched, fall through to default
        }

        // Default: Use the full paywall (includes both EVM and Solana)
        const displayAmount = this.getDisplayAmount(paymentRequired);

        return getPaywallHtml({
          amount: displayAmount,
          paymentRequirements: paymentRequired.accepts,
          currentUrl: paymentRequired.resource?.url || finalConfig.currentUrl || "",
          testnet: finalConfig.testnet ?? true,
          cdpClientKey: finalConfig.cdpClientKey,
          appName: finalConfig.appName,
          appLogo: finalConfig.appLogo,
          sessionTokenEndpoint: finalConfig.sessionTokenEndpoint,
        });
      },
    };
  }

  /**
   * Extract display amount from payment requirements.
   *
   * @param paymentRequired - The payment required object
   * @returns The display amount in decimal format
   */
  private getDisplayAmount(paymentRequired: PaymentRequired): number {
    const accepts = paymentRequired.accepts;
    if (accepts && accepts.length > 0) {
      const firstReq = accepts[0];
      if ("amount" in firstReq && typeof firstReq.amount === "string") {
        // V2 format
        return parseFloat(firstReq.amount) / 1000000; // Assuming USDC with 6 decimals
      }
      if ("maxAmountRequired" in firstReq && typeof firstReq.maxAmountRequired === "string") {
        // V1 format
        return parseFloat(firstReq.maxAmountRequired) / 1000000;
      }
    }
    return 0;
  }
}

/**
 * Create a new paywall builder
 *
 * @returns A new PaywallBuilder instance
 */
export function createPaywall(): PaywallBuilder {
  return new PaywallBuilder();
}

