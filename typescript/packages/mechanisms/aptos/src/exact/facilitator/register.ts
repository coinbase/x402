import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import type { FacilitatorAptosSigner } from "../../signer";
import { ExactAptosScheme } from "./scheme";

/**
 * Configuration options for registering Aptos schemes to an x402Facilitator
 */
export interface AptosFacilitatorConfig {
  /**
   * The Aptos facilitator signer for sponsored transactions
   */
  signer: FacilitatorAptosSigner;

  /**
   * Networks to register (single network or array of networks)
   * Examples: "aptos:1" (mainnet), "aptos:2" (testnet), ["aptos:1", "aptos:2"]
   */
  networks: Network | Network[];

  /**
   * Whether to sponsor transactions (pay gas fees on behalf of clients)
   * Defaults to true
   */
  sponsorTransactions?: boolean;
}

/**
 * Registers Aptos payment schemes to an existing x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Aptos facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * // Single network
 * registerExactAptosScheme(facilitator, {
 *   signer: aptosSigner,
 *   networks: "aptos:1"  // Mainnet
 * });
 *
 * // Multiple networks
 * registerExactAptosScheme(facilitator, {
 *   signer: aptosSigner,
 *   networks: ["aptos:1", "aptos:2"]
 * });
 * ```
 */
export function registerExactAptosScheme(
  facilitator: x402Facilitator,
  config: AptosFacilitatorConfig,
): x402Facilitator {
  facilitator.register(
    config.networks,
    new ExactAptosScheme(config.signer, config.sponsorTransactions ?? true),
  );
  return facilitator;
}
