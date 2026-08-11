import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { ExactEvmScheme } from "./scheme";
import { ExactEvmSchemeV1 } from "../v1/facilitator/scheme";
import { NETWORKS } from "../../v1";

/**
 * Configuration options for registering EVM schemes to an x402Facilitator
 */
export interface EvmFacilitatorConfig {
  /**
   * The EVM signer for facilitator operations (verify and settle)
   */
  signer: FacilitatorEvmSigner;

  /**
   * Networks to register (single network or array of networks)
   * Examples: "eip155:84532", ["eip155:84532", "eip155:1"]
   */
  networks: Network | Network[];

  /**
   * Allowlist of factory contract addresses (hex strings, case-insensitive) that the facilitator
   * will call when deploying an undeployed smart wallet via ERC-6492.
   *
   * A non-empty list enables ERC-4337 smart wallet deployment via EIP-6492. An empty or omitted
   * list denies all factory deployment calls (feature disabled by default).
   *
   * @default []
   */
  eip6492AllowedFactories?: string[];

  /**
   * If enabled, reruns on-chain simulation during settle's re-verify.
   *
   * @default false
   */
  simulateInSettle?: boolean;

  /**
   * Milliseconds to wait for a settlement receipt before giving up and reporting
   * `settlement_pending` with the broadcast transaction hash.
   *
   * Facilitators deployed behind a request deadline (serverless functions, gateway timeouts)
   * should set this a few seconds below that deadline. With the default the platform kills the
   * process mid-wait, so the caller gets a 5xx with no hash instead of `settlement_pending`
   * with a hash to reconcile against.
   *
   * @default 180_000
   */
  confirmationTimeoutMs?: number;
}

/**
 * Registers EVM exact payment schemes to an x402Facilitator instance.
 *
 * This function registers:
 * - V2: Specified networks with ExactEvmScheme
 * - V1: All supported EVM networks with ExactEvmSchemeV1
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for EVM facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactEvmScheme } from "@x402/evm/exact/facilitator/register";
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { createPublicClient, createWalletClient } from "viem";
 *
 * const facilitator = new x402Facilitator();
 *
 * // Single network
 * registerExactEvmScheme(facilitator, {
 *   signer: combinedClient,
 *   networks: "eip155:84532"  // Base Sepolia
 * });
 *
 * // Multiple networks (will auto-derive eip155:* pattern)
 * registerExactEvmScheme(facilitator, {
 *   signer: combinedClient,
 *   networks: ["eip155:84532", "eip155:1"]  // Base Sepolia and Mainnet
 * });
 * ```
 */
export function registerExactEvmScheme(
  facilitator: x402Facilitator,
  config: EvmFacilitatorConfig,
): x402Facilitator {
  // Register V2 scheme with specified networks
  facilitator.register(
    config.networks,
    new ExactEvmScheme(config.signer, {
      eip6492AllowedFactories: config.eip6492AllowedFactories,
      simulateInSettle: config.simulateInSettle,
      confirmationTimeoutMs: config.confirmationTimeoutMs,
    }),
  );

  // Register all V1 networks
  facilitator.registerV1(
    NETWORKS as Network[],
    new ExactEvmSchemeV1(config.signer, {
      eip6492AllowedFactories: config.eip6492AllowedFactories,
      simulateInSettle: config.simulateInSettle,
      confirmationTimeoutMs: config.confirmationTimeoutMs,
    }),
  );

  return facilitator;
}
