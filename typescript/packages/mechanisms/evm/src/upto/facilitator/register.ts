import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { UptoEvmScheme } from "./scheme";

export interface UptoEvmFacilitatorConfig {
  signer: FacilitatorEvmSigner;
  networks: Network | Network[];
}

/**
 * Registers EVM upto payment schemes to an x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for EVM facilitator registration
 * @returns The facilitator instance for chaining
 */
export function registerUptoEvmScheme(
  facilitator: x402Facilitator,
  config: UptoEvmFacilitatorConfig,
): x402Facilitator {
  facilitator.register(config.networks, new UptoEvmScheme(config.signer));
  return facilitator;
}
