import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactHypercoreScheme } from "./scheme.js";

/**
 * Options for registering Hypercore server schemes.
 */
export interface HypercoreServerConfig {
  /**
   * Optional networks to register.
   */
  networks?: Network[];
}

/**
 * Register Hypercore exact schemes on an x402 resource server.
 *
 * @param server - Resource server instance.
 * @param config - Hypercore server registration options.
 * @returns The server instance for chaining.
 */
export function registerExactHypercoreScheme(
  server: x402ResourceServer,
  config?: HypercoreServerConfig,
): x402ResourceServer {
  const scheme = new ExactHypercoreScheme();

  const networks =
    config?.networks && config.networks.length > 0
      ? config.networks
      : ["hypercore:mainnet" as Network, "hypercore:testnet" as Network];

  networks.forEach(network => {
    server.register(network, scheme);
  });

  return server;
}
