import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactAptosScheme } from "./scheme";

/**
 * Configuration options for registering Aptos schemes to an x402ResourceServer
 */
export interface AptosServerConfig {
  /**
   * Optional specific networks to register
   */
  networks?: Network[];
}

/**
 * Registers Aptos payment schemes to an existing x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for Aptos server registration
 * @returns The server instance for chaining
 */
export function registerExactAptosScheme(
  server: x402ResourceServer,
  config: AptosServerConfig = {},
): x402ResourceServer {
  const scheme = new ExactAptosScheme();

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, scheme);
    });
  } else {
    server.register("aptos:*", scheme);
  }

  return server;
}
