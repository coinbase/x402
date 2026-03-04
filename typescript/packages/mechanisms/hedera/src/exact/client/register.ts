import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import type { Network } from "@x402/core/types";
import type { ClientHederaSigner } from "../../signer";
import { ExactHederaScheme } from "./scheme";

/**
 * Configuration options for registering Hedera client schemes.
 */
export interface HederaClientConfig {
  /**
   * The Hedera signer to use for creating payment payloads
   */
  signer: ClientHederaSigner;

  /**
   * Optional payment requirements selector function
   */
  paymentRequirementsSelector?: SelectPaymentRequirements;

  /**
   * Optional policies to apply to the client
   */
  policies?: PaymentPolicy[];

  /**
   * Optional specific networks to register
   */
  networks?: Network[];
}

/**
 * Registers Hedera exact client scheme to an x402Client.
 *
 * @param client - x402 client instance
 * @param config - Registration config
 * @returns Same client
 */
export function registerExactHederaScheme(
  client: x402Client,
  config: HederaClientConfig,
): x402Client {
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      client.register(network, new ExactHederaScheme(config.signer));
    });
  } else {
    client.register("hedera:*", new ExactHederaScheme(config.signer));
  }

  if (config.policies) {
    config.policies.forEach(policy => client.registerPolicy(policy));
  }

  return client;
}
