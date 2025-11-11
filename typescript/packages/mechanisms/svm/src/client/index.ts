import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientSvmSigner } from "../signer";
import { ExactSvmClient } from "../exact";
import { ExactSvmClientV1, NETWORKS } from "../v1";

/**
 * Configuration options for creating an SVM x402 client
 */
export interface SvmClientConfig {
  /**
   * The SVM signer to use for creating payment payloads
   */
  signer: ClientSvmSigner;

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
 * Creates an x402Client configured for SVM payments.
 * 
 * Registers:
 * - V2: solana:* scheme with ExactSvmClient
 * - V1: All supported SVM networks with ExactSvmClientV1
 * 
 * @param config - Configuration for the SVM client
 * @returns A configured x402Client instance
 * 
 * @example
 * ```typescript
 * import { createSvmClient } from "@x402/svm/client";
 * import { toClientSvmSigner } from "@x402/svm";
 * 
 * const signer = toClientSvmSigner(wallet);
 * const client = createSvmClient({ signer });
 * ```
 */
export function createSvmClient(config: SvmClientConfig): x402Client {
  const client = new x402Client(config.paymentRequirementsSelector)
    .registerScheme("solana:*", new ExactSvmClient(config.signer));

  // Register all V1 networks
  NETWORKS.forEach(network => {
    client.registerSchemeV1(network as Network, new ExactSvmClientV1(config.signer));
  });

  // Apply policies if provided
  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}

