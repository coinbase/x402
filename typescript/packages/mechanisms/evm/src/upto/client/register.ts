import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { UptoEvmScheme } from "./scheme";
import { UptoEvmSchemeOptions } from "./rpc";

export interface UptoEvmClientConfig {
  signer: ClientEvmSigner;
  paymentRequirementsSelector?: SelectPaymentRequirements;
  policies?: PaymentPolicy[];
  schemeOptions?: UptoEvmSchemeOptions;
  networks?: Network[];
}

/**
 * Registers EVM upto payment schemes to an x402Client instance.
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for EVM client registration
 * @returns The client instance for chaining
 */
export function registerUptoEvmScheme(client: x402Client, config: UptoEvmClientConfig): x402Client {
  const evmScheme = new UptoEvmScheme(config.signer, config.schemeOptions);

  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      client.register(network, evmScheme);
    });
  } else {
    client.register("eip155:*", evmScheme);
  }

  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
