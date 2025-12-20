import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { ExactStellarScheme } from "./scheme";
import { FacilitatorStellarSigner } from "../../signer";
import type { RpcConfig } from "../../utils";

/**
 * Configuration options for registering Stellar schemes to an x402Facilitator
 */
export interface StellarFacilitatorConfig {
  /**
   * The Stellar signer for facilitator operations
   */
  signer: FacilitatorStellarSigner;

  /**
   * Networks to register (single network or array of networks)
   * Examples: "stellar:testnet", ["stellar:testnet", "stellar:pubnet"]
   */
  networks: Network | Network[];

  /**
   * Optional RPC configuration with custom RPC URL
   */
  rpcConfig?: RpcConfig;

  /**
   * Optional max number of ledgers a signature is allowed to have in order to be submitted by the server (default: 12)
   */
  maxLedgerOffset?: number;
}

/**
 * Registers Stellar payment schemes to an existing x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Stellar facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * // Single network
 * registerExactStellarScheme(facilitator, {
 *   signer: stellarSigner,
 *   networks: "stellar:testnet"
 * });
 *
 * // Multiple networks (will auto-derive stellar:* pattern)
 * registerExactStellarScheme(facilitator, {
 *   signer: stellarSigner,
 *   networks: ["stellar:testnet", "stellar:pubnet"],
 *   rpcConfig: { url: "https://custom-rpc.example.com" }
 * });
 * ```
 */
export function registerExactStellarScheme(
  facilitator: x402Facilitator,
  config: StellarFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme with specified networks
  facilitator.register(
    config.networks,
    new ExactStellarScheme(config.signer, config.rpcConfig, config.maxLedgerOffset),
  );

  return facilitator;
}
