import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { x402ResourceService } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { ClientSvmSigner, FacilitatorSvmSigner } from "../signer";
import { ExactSvmClient } from "../exact/client";
import { ExactSvmService } from "../exact/service";
import { ExactSvmFacilitator } from "../exact/facilitator";
import { ExactSvmClientV1, ExactSvmFacilitatorV1, NETWORKS } from "../v1";

/**
 * Configuration options for registering SVM schemes to an x402Client
 */
export interface SvmClientConfig {
  /**
   * The SVM signer to use for creating payment payloads
   */
  signer: ClientSvmSigner;

  /**
   * Optional payment requirements selector function
   * If not provided, uses the default selector (first available option)
   */
  paymentRequirementsSelector?: SelectPaymentRequirements;

  /**
   * Optional policies to apply to the client
   */
  policies?: PaymentPolicy[];

  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (solana:*)
   */
  networks?: Network[];
}

/**
 * Configuration options for registering SVM schemes to an x402ResourceService
 */
export interface SvmResourceServiceConfig {
  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (solana:*)
   */
  networks?: Network[];
}

/**
 * Configuration options for registering SVM schemes to an x402Facilitator
 */
export interface SvmFacilitatorConfig {
  /**
   * The SVM signer for facilitator operations (verify and settle)
   */
  signer: FacilitatorSvmSigner;

  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (solana:*)
   */
  networks?: Network[];

  /**
   * Optional extra data to include in /supported response
   */
  extras?: Record<string, unknown> | (() => Record<string, unknown>);
}

/**
 * Registers SVM payment schemes to an existing x402Client instance.
 *
 * This function registers:
 * - V2: solana:* wildcard scheme with ExactSvmClient (or specific networks if provided)
 * - V1: All supported SVM networks with ExactSvmClientV1
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for SVM client registration
 * @returns The client instance for chaining
 *
 * @example
 * ```typescript
 * import { registerSvmToClient } from "@x402/svm/register";
 * import { x402Client } from "@x402/core/client";
 * import { generateKeyPairSigner } from "@solana/kit";
 *
 * const signer = await generateKeyPairSigner();
 * const client = new x402Client();
 * registerSvmToClient(client, { signer });
 * ```
 */
export function registerSvmToClient(client: x402Client, config: SvmClientConfig): x402Client {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      client.registerScheme(network, new ExactSvmClient(config.signer));
    });
  } else {
    // Register wildcard for all Solana chains
    client.registerScheme("solana:*", new ExactSvmClient(config.signer));
  }

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

/**
 * Registers SVM payment schemes to an existing x402ResourceService instance.
 *
 * This function registers:
 * - V2: solana:* wildcard scheme with ExactSvmService (or specific networks if provided)
 * - V1: All supported SVM networks with ExactSvmServiceV1
 *
 * @param service - The x402ResourceService instance to register schemes to
 * @param config - Configuration for SVM resource service registration
 * @returns The service instance for chaining
 *
 * @example
 * ```typescript
 * import { registerSvmToResourceService } from "@x402/svm/register";
 * import { x402ResourceService } from "@x402/core/server";
 *
 * const service = new x402ResourceService(facilitatorClient);
 * registerSvmToResourceService(service, {});
 * ```
 */
export function registerSvmToResourceService(
  service: x402ResourceService,
  config: SvmResourceServiceConfig = {},
): x402ResourceService {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      service.registerScheme(network, new ExactSvmService());
    });
  } else {
    // Register wildcard for all Solana chains
    service.registerScheme("solana:*", new ExactSvmService());
  }

  // Note: V1 networks are not registered for ResourceService as V1 is client/facilitator only

  return service;
}

/**
 * Registers SVM payment schemes to an existing x402Facilitator instance.
 *
 * This function registers:
 * - V2: solana:* wildcard scheme with ExactSvmFacilitator (or specific networks if provided)
 * - V1: All supported SVM networks with ExactSvmFacilitatorV1
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for SVM facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { registerSvmToFacilitator } from "@x402/svm/register";
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { createSolanaClient } from "@solana/web3.js";
 *
 * const facilitator = new x402Facilitator();
 * registerSvmToFacilitator(facilitator, {
 *   signer: solanaClient,
 *   extras: { feeToken: "SOL" }
 * });
 * ```
 */
export function registerSvmToFacilitator(
  facilitator: x402Facilitator,
  config: SvmFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      facilitator.registerScheme(network, new ExactSvmFacilitator(config.signer), config.extras);
    });
  } else {
    // Register wildcard for all Solana chains
    facilitator.registerScheme("solana:*", new ExactSvmFacilitator(config.signer), config.extras);
  }

  // Register all V1 networks
  NETWORKS.forEach(network => {
    facilitator.registerSchemeV1(
      network as Network,
      new ExactSvmFacilitatorV1(config.signer),
      config.extras,
    );
  });

  return facilitator;
}
