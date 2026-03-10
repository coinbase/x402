import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { UptoEvmScheme } from "./scheme";

export interface UptoEvmFacilitatorConfig {
  signer: FacilitatorEvmSigner;
  networks: Network | Network[];
}

export function registerUptoEvmScheme(
  facilitator: x402Facilitator,
  config: UptoEvmFacilitatorConfig,
): x402Facilitator {
  facilitator.register(config.networks, new UptoEvmScheme(config.signer));
  return facilitator;
}
