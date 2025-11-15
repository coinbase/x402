import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { x402ResourceService } from "@x402/core/server";
import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { ClientEvmSigner, FacilitatorEvmSigner } from "../signer";
import { ExactEvmClient } from "../exact/client";
import { ExactEvmService } from "../exact/service";
import { ExactEvmFacilitator } from "../exact/facilitator";
import { ExactEvmClientV1, ExactEvmFacilitatorV1, NETWORKS } from "../v1";

/**
 * Configuration options for registering EVM schemes to an x402Client
 */
export interface EvmClientConfig {
  /**
   * The EVM signer to use for creating payment payloads
   */
  signer: ClientEvmSigner;

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
   * If not provided, registers wildcard support (eip155:*)
   */
  networks?: Network[];
}

/**
 * Configuration options for registering EVM schemes to an x402ResourceService
 */
export interface EvmResourceServiceConfig {
  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (eip155:*)
   */
  networks?: Network[];
}

/**
 * Configuration options for registering EVM schemes to an x402Facilitator
 */
export interface EvmFacilitatorConfig {
  /**
   * The EVM signer for facilitator operations (verify and settle)
   */
  signer: FacilitatorEvmSigner;

  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (eip155:*)
   */
  networks?: Network[];

  /**
   * Optional extra data to include in /supported response
   */
  extras?: Record<string, unknown> | (() => Record<string, unknown>);
}

/**
 * Registers EVM payment schemes to an existing x402Client instance.
 *
 * This function registers:
 * - V2: eip155:* wildcard scheme with ExactEvmClient (or specific networks if provided)
 * - V1: All supported EVM networks with ExactEvmClientV1
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for EVM client registration
 * @returns The client instance for chaining
 *
 * @example
 * ```typescript
 * import { registerEvmToClient } from "@x402/evm/register";
 * import { x402Client } from "@x402/core/client";
 * import { privateKeyToAccount } from "viem/accounts";
 *
 * const account = privateKeyToAccount("0x...");
 * const client = new x402Client();
 * registerEvmToClient(client, { signer: account });
 * ```
 */
export function registerEvmToClient(client: x402Client, config: EvmClientConfig): x402Client {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      client.registerScheme(network, new ExactEvmClient(config.signer));
    });
  } else {
    // Register wildcard for all EVM chains
    client.registerScheme("eip155:*", new ExactEvmClient(config.signer));
  }

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

/**
 * Registers EVM payment schemes to an existing x402ResourceService instance.
 *
 * This function registers:
 * - V2: eip155:* wildcard scheme with ExactEvmService (or specific networks if provided)
 * - V1: All supported EVM networks with ExactEvmServiceV1
 *
 * @param service - The x402ResourceService instance to register schemes to
 * @param config - Configuration for EVM resource service registration
 * @returns The service instance for chaining
 *
 * @example
 * ```typescript
 * import { registerEvmToResourceService } from "@x402/evm/register";
 * import { x402ResourceService } from "@x402/core/server";
 *
 * const service = new x402ResourceService(facilitatorClient);
 * registerEvmToResourceService(service, {});
 * ```
 */
export function registerEvmToResourceService(
  service: x402ResourceService,
  config: EvmResourceServiceConfig = {},
): x402ResourceService {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      service.registerScheme(network, new ExactEvmService());
    });
  } else {
    // Register wildcard for all EVM chains
    service.registerScheme("eip155:*", new ExactEvmService());
  }

  // Note: V1 networks are not registered for ResourceService as V1 is client/facilitator only

  return service;
}

/**
 * Registers EVM payment schemes to an existing x402Facilitator instance.
 *
 * This function registers:
 * - V2: eip155:* wildcard scheme with ExactEvmFacilitator (or specific networks if provided)
 * - V1: All supported EVM networks with ExactEvmFacilitatorV1
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for EVM facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { registerEvmToFacilitator } from "@x402/evm/register";
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { createPublicClient, createWalletClient } from "viem";
 *
 * const facilitator = new x402Facilitator();
 * registerEvmToFacilitator(facilitator, {
 *   signer: combinedClient,
 *   extras: { gasToken: "ETH" }
 * });
 * ```
 */
export function registerEvmToFacilitator(
  facilitator: x402Facilitator,
  config: EvmFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      facilitator.registerScheme(network, new ExactEvmFacilitator(config.signer), config.extras);
    });
  } else {
    // Register wildcard for all EVM chains
    facilitator.registerScheme("eip155:*", new ExactEvmFacilitator(config.signer), config.extras);
  }

  // Register all V1 networks
  NETWORKS.forEach(network => {
    facilitator.registerSchemeV1(
      network as Network,
      new ExactEvmFacilitatorV1(config.signer),
      config.extras,
    );
  });

  return facilitator;
}
