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
   * The list of Stellar signers used for facilitator operations.
   */
  signers: FacilitatorStellarSigner[];

  /**
   * Networks to register (single network or array of networks)
   * Examples: "stellar:testnet", ["stellar:testnet", "stellar:pubnet"]
   */
  networks: Network | Network[];

  /**
   * Flag indicating to clients if they can expect fees to be sponsored. As of now, the spec only supports `areFeesSponsored: true`.
   */
  areFeesSponsored?: boolean;

  /**
   * Optional RPC configuration with custom RPC URL
   */
  rpcConfig?: RpcConfig;

  /**
   * Optional callback to select which signer to use for settlement.
   * Receives an array of facilitator addresses and returns the selected address.
   * Defaults to round-robin selection.
   */
  selectSigner?: (addresses: readonly string[]) => string;
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
 * // Single network with single signer
 * registerExactStellarScheme(facilitator, {
 *   signers: [stellarSigner],
 *   networks: "stellar:testnet"
 * });
 *
 * // Multiple networks with multiple signers (round-robin)
 * registerExactStellarScheme(facilitator, {
 *   signers: [stellarSigner1, stellarSigner2],
 *   networks: ["stellar:testnet", "stellar:pubnet"],
 *   rpcConfig: { url: "https://custom-rpc.example.com" }
 * });
 *
 * // Custom signer selection
 * registerExactStellarScheme(facilitator, {
 *   signers: [stellarSigner1, stellarSigner2],
 *   networks: "stellar:testnet",
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
    new ExactStellarScheme(config.signers, {
      rpcConfig: config.rpcConfig,
      areFeesSponsored: config.areFeesSponsored,
      selectSigner: config.selectSigner,
    }),
  );

  return facilitator;
}
