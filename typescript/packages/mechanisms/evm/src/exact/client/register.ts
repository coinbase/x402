import { x402Client, SelectPaymentRequirements, PaymentPolicy } from "@x402/core/client";
import { Network } from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { ERC7710PaymentProvider } from "../../types";
import { ExactEvmScheme } from "./scheme";
import { ExactEvmSchemeV1 } from "../v1/client/scheme";
import { NETWORKS } from "../../v1";

/**
 * Configuration options for registering EVM schemes to an x402Client
 */
export interface EvmClientConfig {
  /**
   * The EVM signer to use for creating EIP-3009 payment payloads.
   * Required unless erc7710Provider is provided.
   */
  signer?: ClientEvmSigner;

  /**
   * ERC-7710 payment provider for delegation-based payments.
   * When provided, 7710 payments are preferred over EIP-3009.
   */
  erc7710Provider?: ERC7710PaymentProvider;

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
 * Registers EVM exact payment schemes to an x402Client instance.
 *
 * This function registers:
 * - V2: eip155:* wildcard scheme with ExactEvmScheme (or specific networks if provided)
 * - V1: All supported EVM networks with ExactEvmSchemeV1
 *
 * @param client - The x402Client instance to register schemes to
 * @param config - Configuration for EVM client registration
 * @returns The client instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactEvmScheme } from "@x402/evm/exact/client/register";
 * import { x402Client } from "@x402/core/client";
 * import { privateKeyToAccount } from "viem/accounts";
 *
 * const account = privateKeyToAccount("0x...");
 * const client = new x402Client();
 * registerExactEvmScheme(client, { signer: account });
 * ```
 */
export function registerExactEvmScheme(client: x402Client, config: EvmClientConfig): x402Client {
  // Validate configuration
  if (!config.signer && !config.erc7710Provider) {
    throw new Error(
      "EvmClientConfig requires either a signer (for EIP-3009) or an ERC7710PaymentProvider",
    );
  }

  // Create scheme config
  const schemeConfig = {
    signer: config.signer,
    erc7710Provider: config.erc7710Provider,
  };

  // Register V2 scheme
  if (config.networks && config.networks.length > 0) {
    // Register specific networks
    config.networks.forEach(network => {
      client.register(network, new ExactEvmScheme(schemeConfig));
    });
  } else {
    // Register wildcard for all EVM chains
    client.register("eip155:*", new ExactEvmScheme(schemeConfig));
  }

  // Register all V1 networks (V1 only supports EIP-3009, requires signer)
  if (config.signer) {
    NETWORKS.forEach(network => {
      client.registerV1(network as Network, new ExactEvmSchemeV1(config.signer!));
    });
  }

  // Apply policies if provided
  if (config.policies) {
    config.policies.forEach(policy => {
      client.registerPolicy(policy);
    });
  }

  return client;
}
