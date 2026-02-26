import { x402Facilitator } from "@x402/core/facilitator";
import type { Network } from "@x402/core/types";
import type { FacilitatorHederaSigner } from "../../signer";
import { ExactHederaScheme } from "./scheme";
import type { HederaFacilitatorConfig } from "./scheme";

/**
 * Config for registering Hedera facilitator scheme.
 */
export interface HederaFacilitatorRegisterConfig extends HederaFacilitatorConfig {
  signer: FacilitatorHederaSigner;
  networks: Network | Network[];
}

/**
 * Registers Hedera exact facilitator scheme to x402Facilitator.
 *
 * @param facilitator - Facilitator instance
 * @param config - Register config
 * @returns Same facilitator
 */
export function registerExactHederaScheme(
  facilitator: x402Facilitator,
  config: HederaFacilitatorRegisterConfig,
): x402Facilitator {
  facilitator.register(config.networks, new ExactHederaScheme(config.signer, config));
  return facilitator;
}
