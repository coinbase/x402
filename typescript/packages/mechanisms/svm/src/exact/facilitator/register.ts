import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorSvmSigner } from "../../signer";
import { ExactSvmScheme } from "./scheme";
import { ExactSvmSchemeV1 } from "../v1/facilitator/scheme";
import { NETWORKS } from "../../v1";

/**
 * Configuration options for registering SVM schemes to an x402Facilitator
 */
export interface SvmFacilitatorConfig {
  /**
   * The SVM signer for facilitator operations
   */
  signer: FacilitatorSvmSigner;

  /**
   * Networks to register (single network or array of networks)
   * Examples: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", ["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]
   */
  networks: Network | Network[];
}

/**
 * Registers SVM payment schemes to an existing x402Facilitator instance.
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for SVM facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * // Single network
 * registerExactSvmScheme(facilitator, {
 *   signer: svmSigner,
 *   networks: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"  // Devnet
 * });
 *
 * // Multiple networks (will auto-derive solana:* pattern)
 * registerExactSvmScheme(facilitator, {
 *   signer: svmSigner,
 *   networks: ["solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]
 * });
 * ```
 */
export function registerExactSvmScheme(
  facilitator: x402Facilitator,
  config: SvmFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme with specified networks
  facilitator.register(config.networks, new ExactSvmScheme(config.signer));

  // Register all V1 networks
  facilitator.registerV1(NETWORKS as Network[], new ExactSvmSchemeV1(config.signer));

  return facilitator;
}
