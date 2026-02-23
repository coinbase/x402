/**
 * Observed x402 middleware for Express with built-in observability.
 *
 * Drop-in replacement for @x402/express that adds transparent logging
 * of all payment workflow events to a local SQLite database.
 */

export { paymentMiddleware } from "./middleware";

// Re-export types and utilities from @x402/express for convenience
export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
  PaywallProvider,
  PaywallConfig,
  RouteValidationError,
} from "@x402/express";

export { x402ResourceServer, x402HTTPResourceServer, RouteConfigurationError } from "@x402/express";
