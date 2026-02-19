import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientHypercoreSigner } from "../../signer.js";
import { ExactHypercoreScheme } from "./scheme.js";

/**
 * Configuration options for registering Hypercore schemes.
 */
export interface HypercoreClientConfig {
  /**
   * Signer used to create payment payloads.
   */
  signer: ClientHypercoreSigner;

  /**
   * Optional payment requirements selector.
   */
  paymentRequirementsSelector?: SelectPaymentRequirements;

  /**
   * Optional policies to apply to the client.
   */
  policies?: PaymentPolicy[];

  /**
   * Optional networks to register.
   */
  networks?: Network[];
}

/**
 * Register Hypercore exact schemes on an x402 client.
 *
 * @param client - x402 client instance.
 * @param config - Hypercore client registration options.
 * @returns The client instance for chaining.
 */
export function registerExactHypercoreScheme(
  client: x402Client,
  config: HypercoreClientConfig,
): x402Client {
  const scheme = new ExactHypercoreScheme(config.signer);

  const networks =
    config.networks && config.networks.length > 0
      ? config.networks
      : ["hypercore:mainnet" as Network, "hypercore:testnet" as Network];

  networks.forEach(network => {
    client.register(network, scheme);
  });

  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
