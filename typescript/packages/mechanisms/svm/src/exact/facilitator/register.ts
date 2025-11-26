import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorSvmSigner } from "../../signer";
import { ExactSvmScheme } from "./scheme";
import { ExactSvmSchemeV1 } from "../v1/facilitator/scheme";
import { NETWORKS } from "../../v1";

/**
 * Configuration options for registering SVM schemes to an x402Facilitator
 */
export interface SvmFacilitatorConfig {
  /**
   * The SVM signer for facilitator operations
   */
  signer: FacilitatorSvmSigner;

  /**
   * Optional specific networks to register
   */
  networks?: Network[];
}

/**
 * Registers SVM payment schemes to an existing x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for SVM facilitator registration
 * @returns The facilitator instance for chaining
 */
export function registerExactSvmScheme(
  facilitator: x402Facilitator,
  config: SvmFacilitatorConfig,
): x402Facilitator {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      facilitator.register(network, new ExactSvmScheme(config.signer));
    });
  } else {
    facilitator.register("solana:*", new ExactSvmScheme(config.signer));
  }

  // Register all V1 networks
  NETWORKS.forEach(network => {
    facilitator.registerV1(network as Network, new ExactSvmSchemeV1(config.signer));
  });

  return facilitator;
}
