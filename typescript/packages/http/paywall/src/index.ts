/**
 * @module @x402/paywall - x402 Payment Protocol Paywall Extension
 * This module provides paywall functionality for the x402 payment protocol.
 */

// Legacy function export (v1 compatibility)
export { getPaywallHtml } from "./paywall";

// Builder pattern exports (v2)
export { createPaywall, PaywallBuilder } from "./builder";
export type {
  PaywallProvider,
  PaywallConfig,
  PaymentRequired,
  PaywallNetworkHandler,
  PaymentRequirements,
} from "./types";

// Re-export network handlers for convenience
export { evmPaywall } from "./evm";
export { svmPaywall } from "./svm";
