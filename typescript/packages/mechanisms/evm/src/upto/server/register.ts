import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { UptoEvmScheme } from "./scheme";

export interface UptoEvmResourceServerConfig {
  networks?: Network[];
}

/**
 * Registers EVM upto payment schemes to an x402ResourceServer instance.
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for EVM resource server registration
 * @returns The server instance for chaining
 */
export function registerUptoEvmScheme(
  server: x402ResourceServer,
  config: UptoEvmResourceServerConfig = {},
): x402ResourceServer {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      server.register(network, new UptoEvmScheme());
    });
  } else {
    server.register("eip155:*", new UptoEvmScheme());
  }

  return server;
}
