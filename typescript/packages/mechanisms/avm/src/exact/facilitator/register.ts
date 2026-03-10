/**
 * AVM Facilitator Registration for Exact Payment Protocol
 *
 * Registers AVM exact payment schemes to an x402Facilitator instance.
 */

import { x402Facilitator } from '@x402/core/facilitator'
import type { Network } from '@x402/core/types'
import type { FacilitatorAvmSigner } from '../../signer'
import { ExactAvmScheme } from './scheme'
import { ExactAvmSchemeV1 } from '../v1/facilitator/scheme'
import { NETWORKS } from '../../v1'

/**
 * Configuration options for registering AVM schemes to an x402Facilitator
 */
export interface AvmFacilitatorConfig {
  /**
   * The AVM signer for facilitator operations (verify and settle)
   */
  signer: FacilitatorAvmSigner

  /**
   * Networks to register (single network or array of networks)
   * Examples: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=", ["algorand-mainnet", "algorand-testnet"]
   */
  networks: Network | Network[]
}

/**
 * Registers AVM exact payment schemes to an x402Facilitator instance.
 *
 * This function registers:
 * - V2: Specified networks with ExactAvmScheme
 * - V1: All supported AVM networks with ExactAvmSchemeV1
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for AVM facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactAvmScheme } from "@x402/avm/exact/facilitator";
 * import type { FacilitatorAvmSigner } from "@x402/avm";
 * import { x402Facilitator } from "@x402/core/facilitator";
 * // Create signer implementing FacilitatorAvmSigner interface
 * // See examples/typescript/facilitator for full implementation
 * const signer: FacilitatorAvmSigner = createFacilitatorSigner(
 *   process.env.AVM_PRIVATE_KEY!
 * );
 *
 * const facilitator = new x402Facilitator();
 *
 * registerExactAvmScheme(facilitator, {
 *   signer,
 *   networks: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8="
 * });
 * ```
 */
export function registerExactAvmScheme(
  facilitator: x402Facilitator,
  config: AvmFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme with specified networks
  facilitator.register(config.networks, new ExactAvmScheme(config.signer))

  // Register all V1 networks
  facilitator.registerV1(NETWORKS as Network[], new ExactAvmSchemeV1(config.signer))

  return facilitator
}
