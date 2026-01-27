import { x402Client, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import type { ClientAptosSigner, ClientAptosConfig } from "../../signer";
import { ExactAptosScheme } from "./scheme";

/**
 * Configuration options for registering Aptos schemes to an x402Client
 */
export interface AptosClientConfig {
  /**
   * The Aptos account signer for client operations
   */
  signer: ClientAptosSigner;

  /**
   * Optional configuration (e.g., custom RPC URL)
   */
  config?: ClientAptosConfig;

  /**
   * Optional specific networks to register
   */
  networks?: Network[];

  /**
   * Optional policies to apply to the client
   */
  policies?: PaymentPolicy[];
}

/**
 * Registers Aptos payment schemes to an existing x402Client instance.
 *
 * @param client - The x402Client instance to register schemes to
 * @param aptosConfig - Configuration for Aptos client registration
 * @returns The client instance for chaining
 */
export function registerExactAptosScheme(
  client: x402Client,
  aptosConfig: AptosClientConfig,
): x402Client {
  const scheme = new ExactAptosScheme(aptosConfig.signer, aptosConfig.config);

  if (aptosConfig.networks && aptosConfig.networks.length > 0) {
    for (const network of aptosConfig.networks) {
      client.register(network, scheme);
    }
  } else {
    client.register("aptos:*", scheme);
  }

  if (aptosConfig.policies) {
    aptosConfig.policies.forEach(policy => client.registerPolicy(policy));
  }

  return client;
}
