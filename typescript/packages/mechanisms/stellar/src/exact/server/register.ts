import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactStellarScheme } from "./scheme";

/**
 * Configuration options for registering Stellar schemes to an x402ResourceServer
 */
export interface StellarResourceServerConfig {
  /**
   * Optional specific networks to register
   */
  networks?: Network[];
}

/**
 * Registers Stellar payment schemes to an existing x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for Stellar resource server registration
 * @returns The server instance for chaining
 */
export function registerExactStellarScheme(
  server: x402ResourceServer,
  config: StellarResourceServerConfig = {},
): x402ResourceServer {
  const scheme = new ExactStellarScheme();

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, scheme);
    });
  } else {
    server.register("stellar:*", scheme);
  }

  return server;
}
