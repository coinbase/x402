import { x402ResourceServer } from "@x402/core/server";
import { Network } from "@x402/core/types";
import { UptoEvmScheme } from "./scheme";

export interface UptoEvmResourceServerConfig {
  networks?: Network[];
}

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
