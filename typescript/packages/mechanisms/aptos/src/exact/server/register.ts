import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactAptosScheme } from "./scheme";

/**
 * Configuration options for registering Aptos schemes to an x402ResourceServer
 */
export interface AptosServerConfig {
  /**
   * Optional specific networks to register.
   * If not provided, registers for all Aptos networks (aptos:*)
   */
  networks?: Network[];
}

/**
 * Registers Aptos payment schemes to an existing x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for Aptos server registration
 * @returns The ExactAptosScheme instance for further configuration (e.g., registerMoneyParser)
 *
 * @example
 * ```typescript
 * // Register for all Aptos networks
 * const scheme = registerExactAptosScheme(server);
 *
 * // Register for specific networks
 * const scheme = registerExactAptosScheme(server, {
 *   networks: ["aptos:1"]  // Mainnet only
 * });
 *
 * // Optionally add custom money parsers
 * scheme.registerMoneyParser(async (amount, network) => {
 *   // Custom conversion logic
 *   return { amount: "...", asset: "..." };
 * });
 * ```
 */
export function registerExactAptosScheme(
  server: x402ResourceServer,
  config: AptosServerConfig = {},
): ExactAptosScheme {
  const scheme = new ExactAptosScheme();

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, scheme);
    });
  } else {
    server.register("aptos:*", scheme);
  }

  return scheme;
}
