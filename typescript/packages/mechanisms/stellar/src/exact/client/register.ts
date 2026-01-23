import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ExactStellarScheme } from "./scheme";
import { ClientStellarSigner } from "../../signer";
import type { RpcConfig } from "../../utils";

/**
 * Configuration options for registering Stellar schemes to an x402Client
 */
export interface StellarClientConfig {
  /**
   * The Stellar signer to use for creating payment payloads
   */
  signer: ClientStellarSigner;

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

  /**
   * Optional RPC configuration with custom RPC URL
   */
  rpcConfig?: RpcConfig;
}

/**
 * Registers Stellar payment schemes to an existing x402Client instance.
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for Stellar client registration
 * @returns The client instance for chaining
 */
export function registerExactStellarScheme(
  client: x402Client,
  config: StellarClientConfig,
): x402Client {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    config.networks.forEach(network => {
      client.register(network, new ExactStellarScheme(config.signer, config.rpcConfig));
    });
  } else {
    client.register("stellar:*", new ExactStellarScheme(config.signer, config.rpcConfig));
  }

  // Register policies if provided
  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
