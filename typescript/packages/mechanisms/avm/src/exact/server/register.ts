/**
 * AVM Server Registration for Exact Payment Protocol
 *
 * Registers AVM exact payment schemes to an x402ResourceServer instance.
 */

import { x402ResourceServer } from '@x402/core/server'
import type { Network } from '@x402/core/types'
import { ExactAvmScheme } from './scheme'

/**
 * Configuration options for registering AVM schemes to an x402ResourceServer
 */
export interface AvmResourceServerConfig {
  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (algorand:*)
   */
  networks?: Network[]
}

/**
 * Registers AVM exact payment schemes to an x402ResourceServer instance.
 *
 * This function registers:
 * - V2: algorand:* wildcard scheme with ExactAvmScheme (or specific networks if provided)
 *
 * @param server - The x402ResourceServer instance to register schemes to
 * @param config - Configuration for AVM resource server registration
 * @returns The server instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactAvmScheme } from "@x402/avm/exact/server";
 * import { x402ResourceServer } from "@x402/core/server";
 *
 * const server = new x402ResourceServer(facilitatorClient);
 * registerExactAvmScheme(server, {});
 * ```
 */
export function registerExactAvmScheme(
  server: x402ResourceServer,
  config: AvmResourceServerConfig = {},
): x402ResourceServer {
  const scheme = new ExactAvmScheme()

  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      server.register(network, scheme)
    })
  } else {
    // Register wildcard for all Algorand networks
    server.register('algorand:*', scheme)
  }

  return server
}
