import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { ExactConcordiumScheme } from "./scheme";

/**
 * Configuration options for registering Concordium schemes to an x402ResourceServer
 */
export interface ConcordiumResourceServerConfig {
  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (ccd:*)
   */
  networks?: Network[];
}

/**
 * Registers Concordium exact payment schemes to an x402ResourceServer instance.
 *
 * This function registers:
 * - V2: ccd:* wildcard scheme with ExactConcordiumScheme (or specific networks if provided)
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for Concordium resource server registration
 * @returns The server instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactConcordiumScheme } from "@x402/concordium/exact/server";
 * import { x402ResourceServer } from "@x402/core/server";
 *
 * const server = new x402ResourceServer(facilitatorClient);
 * registerExactConcordiumScheme(server, {});
 * ```
 */
export function registerExactConcordiumScheme(
  server: x402ResourceServer,
  config: ConcordiumResourceServerConfig = {},
): x402ResourceServer {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      server.register(network, new ExactConcordiumScheme());
    });
  } else {
    // Register wildcard for all Concordium chains
    server.register("ccd:*", new ExactConcordiumScheme());
  }

  return server;
}
