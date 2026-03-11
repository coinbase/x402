/**
 * AVM Client Registration for Exact Payment Protocol
 *
 * Registers AVM exact payment schemes to an x402Client instance.
 */

import { x402Client, SelectPaymentRequirements, PaymentPolicy } from '@x402/core/client'
import type { Network } from '@x402/core/types'
import type { ClientAvmSigner, ClientAvmConfig } from '../../signer'
import { ExactAvmScheme } from './scheme'
import { ExactAvmSchemeV1 } from '../v1/client/scheme'
import { NETWORKS } from '../../v1'

/**
 * Configuration options for registering AVM schemes to an x402Client
 */
export interface AvmClientConfig {
  /**
   * The AVM signer to use for creating payment payloads
   */
  signer: ClientAvmSigner

  /**
   * Optional configuration for Algod client
   */
  algodConfig?: ClientAvmConfig

  /**
   * Optional payment requirements selector function
   * If not provided, uses the default selector (first available option)
   */
  paymentRequirementsSelector?: SelectPaymentRequirements

  /**
   * Optional policies to apply to the client
   */
  policies?: PaymentPolicy[]

  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (algorand:*)
   */
  networks?: Network[]
}

/**
 * Registers AVM exact payment schemes to an x402Client instance.
 *
 * This function registers:
 * - V2: algorand:* wildcard scheme with ExactAvmScheme (or specific networks if provided)
 * - V1: All supported AVM networks with ExactAvmSchemeV1
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for AVM client registration
 * @returns The client instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactAvmScheme } from "@x402/avm/exact/client";
 * import { x402Client } from "@x402/core/client";
 *
 * const signer = { address: "...", signTransactions: async () => [] };
 * const client = new x402Client();
 * registerExactAvmScheme(client, { signer });
 * ```
 */
export function registerExactAvmScheme(client: x402Client, config: AvmClientConfig): x402Client {
  const scheme = new ExactAvmScheme(config.signer, config.algodConfig)

  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      client.register(network, scheme)
    })
  } else {
    // Register wildcard for all Algorand networks
    client.register('algorand:*', scheme)
  }

  // Register all V1 networks
  const v1Scheme = new ExactAvmSchemeV1(config.signer, config.algodConfig)
  NETWORKS.forEach(network => {
    client.registerV1(network as Network, v1Scheme)
  })

  // Apply policies if provided
  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy)
    })
  }

  return client
}
