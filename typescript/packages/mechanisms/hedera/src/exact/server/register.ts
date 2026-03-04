import { x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "./scheme";
import type { HederaServerConfig } from "./scheme";

/**
 * Configuration options for registering Hedera server scheme.
 */
export interface HederaResourceServerConfig extends HederaServerConfig {
  networks?: Network[];
}

/**
 * Registers Hedera exact server scheme to an x402ResourceServer.
 *
 * @param server - x402 resource server
 * @param config - Optional register config
 * @returns Same server
 */
export function registerExactHederaScheme(
  server: x402ResourceServer,
  config: HederaResourceServerConfig = {},
): x402ResourceServer {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, new ExactHederaScheme(config));
    });
  } else {
    server.register("hedera:*", new ExactHederaScheme(config));
  }
  return server;
}
