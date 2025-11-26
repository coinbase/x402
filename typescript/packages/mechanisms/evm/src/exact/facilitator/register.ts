import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactEvmScheme } from "./scheme";
import { ExactEvmSchemeV1 } from "../v1/facilitator/scheme";
import { NETWORKS } from "../../v1";

/**
 * Configuration options for registering EVM schemes to an x402Facilitator
 */
export interface EvmFacilitatorConfig {
  /**
   * The EVM signer for facilitator operations (verify and settle)
   */
  signer: FacilitatorEvmSigner;

  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (eip155:*)
   */
  networks?: Network[];
}

/**
 * Registers EVM exact payment schemes to an x402Facilitator instance.
 *
 * This function registers:
 * - V2: eip155:* wildcard scheme with ExactEvmScheme (or specific networks if provided)
 * - V1: All supported EVM networks with ExactEvmSchemeV1
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for EVM facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactEvmScheme } from "@x402/evm/exact/facilitator/register";
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { createPublicClient, createWalletClient } from "viem";
 *
 * const facilitator = new x402Facilitator();
 * registerExactEvmScheme(facilitator, {
 *   signer: combinedClient
 * });
 * ```
 */
export function registerExactEvmScheme(
  facilitator: x402Facilitator,
  config: EvmFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      facilitator.register(network, new ExactEvmScheme(config.signer));
    });
  } else {
    // Register wildcard for all EVM chains
    facilitator.register("eip155:*", new ExactEvmScheme(config.signer));
  }

  // Register all V1 networks
  NETWORKS.forEach(network => {
    facilitator.registerV1(network as Network, new ExactEvmSchemeV1(config.signer));
  });

  return facilitator;
}
