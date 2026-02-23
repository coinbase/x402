/**
 * Observed x402 middleware for Next.js with built-in observability.
 *
 * Drop-in replacement for @x402/next that adds transparent logging
 * of all payment workflow events to a local SQLite database.
 */

export {
  paymentProxy,
  paymentProxyFromHTTPServer,
  withX402,
  withX402FromHTTPServer,
  configureObservability,
} from "./middleware";

export type { ObservabilityConfig } from "./middleware";

// Re-export types and utilities from @x402/next for convenience
export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
  PaywallProvider,
  PaywallConfig,
  RouteConfig,
  RouteValidationError,
} from "@x402/next";

export {
  x402ResourceServer,
  x402HTTPResourceServer,
  RouteConfigurationError,
  NextAdapter,
} from "@x402/next";
