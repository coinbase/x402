import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientEvmSigner } from "../signer";
import { ExactEvmClient } from "../exact";
import { ExactEvmClientV1, NETWORKS } from "../v1";

/**
 * Configuration options for creating an EVM x402 client
 */
export interface EvmClientConfig {
  /**
   * The EVM signer to use for creating payment payloads
   */
  signer: ClientEvmSigner;

  /**
   * Custom payment requirements selector function
   * If not provided, uses the default selector (first available option)
   */
  paymentRequirementsSelector?: SelectPaymentRequirements;

  /**
   * Policies to apply to the client
   */
  policies?: PaymentPolicy[];
}

/**
 * Creates an x402Client configured for EVM payments.
 * 
 * Registers:
 * - V2: eip155:* scheme with ExactEvmClient
 * - V1: All supported EVM networks with ExactEvmClientV1
 * 
 * @param config - Configuration for the EVM client
 * @returns A configured x402Client instance
 * 
 * @example
 * ```typescript
 * import { createEvmClient } from "@x402/evm/client";
 * import { toClientEvmSigner } from "@x402/evm";
 * 
 * const signer = toClientEvmSigner(wallet);
 * const client = createEvmClient({ signer });
 * ```
 */
export function createEvmClient(config: EvmClientConfig): x402Client {
  const client = new x402Client(config.paymentRequirementsSelector)
    .registerScheme("eip155:*", new ExactEvmClient(config.signer));

  // Register all V1 networks
  NETWORKS.forEach(network => {
    client.registerSchemeV1(network as Network, new ExactEvmClientV1(config.signer));
  });

  // Apply policies if provided
  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}

