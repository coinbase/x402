import { x402Client, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ExactConcordiumScheme, ExactConcordiumSchemeConfig } from "./scheme";
import { ExactConcordiumSchemeV1 } from "../v1";
import { CONCORDIUM_V1_NETWORKS } from "../../config";

/**
 * Configuration options for registering Concordium schemes to an x402Client
 */
export interface ConcordiumClientConfig extends ExactConcordiumSchemeConfig {
  /**
   * Optional policies to apply to the client
   */
  policies?: PaymentPolicy[];

  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (ccd:*)
   */
  networks?: Network[];
}

/**
 * Registers Concordium exact payment schemes to an x402Client instance.
 *
 * This function registers:
 * - V2: ccd:* wildcard scheme with ExactConcordiumScheme (or specific networks if provided)
 * - V1: All supported Concordium V1 networks
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for Concordium client registration
 * @returns The client instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactConcordiumScheme } from "@x402/concordium/exact/client";
 * import { x402Client } from "@x402/core/client";
 *
 * const client = new x402Client();
 * registerExactConcordiumScheme(client, {
 *   createAndBroadcastTransaction: async (payTo, amount, asset) => {
 *     // Use Concordium wallet SDK to create and broadcast transaction
 *     const txHash = await wallet.sendTransaction({ to: payTo, amount, asset });
 *     return { txHash, sender: wallet.address };
 *   }
 * });
 * ```
 */
export function registerExactConcordiumScheme(
  client: x402Client,
  config: ConcordiumClientConfig,
): x402Client {
  const scheme = new ExactConcordiumScheme(config);

  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      client.register(network, scheme);
    });
  } else {
    // Register wildcard for all Concordium chains
    client.register("ccd:*", scheme);
  }

  // Register all V1 networks
  const v1Scheme = new ExactConcordiumSchemeV1(config);
  CONCORDIUM_V1_NETWORKS.forEach(network => {
    client.registerV1(network as Network, v1Scheme);
  });

  // Apply policies if provided
  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
