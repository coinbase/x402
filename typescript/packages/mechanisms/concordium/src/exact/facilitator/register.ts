import { x402Facilitator } from "@x402/core/facilitator";
import { Network, SchemeNetworkFacilitator } from "@x402/core/types";
import { ExactConcordiumScheme, ExactConcordiumSchemeConfig } from "./scheme";
import { ExactConcordiumSchemeV1Facilitator } from "../v1";
import { CONCORDIUM_V1_NETWORKS } from "../../config";

/**
 * Configuration options for registering Concordium schemes to an x402Facilitator
 */
export interface ConcordiumFacilitatorConfig extends ExactConcordiumSchemeConfig {
  /**
   * Optional specific networks to register
   * If not provided, registers wildcard support (ccd:*)
   */
  networks?: Network[];
}

/**
 * Registers Concordium exact payment schemes to an x402Facilitator instance.
 *
 * This function registers:
 * - V2: ccd:* wildcard scheme with ExactConcordiumScheme (or specific networks if provided)
 * - V1: All supported Concordium V1 networks
 *
 * @param facilitator - The x402Facilitator instance to register schemes to
 * @param config - Configuration for Concordium facilitator registration
 * @returns The facilitator instance for chaining
 *
 * @example
 * ```typescript
 * import { registerExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
 * import { x402Facilitator } from "@x402/core/facilitator";
 * import { ConcordiumGRPCClient } from "@concordium/node-sdk";
 *
 * const nodeClient = createConcordiumNodeClient(grpcClient);
 * const facilitator = new x402Facilitator();
 * registerExactConcordiumScheme(facilitator, { nodeClient });
 * ```
 */
export function registerExactConcordiumScheme(
  facilitator: x402Facilitator,
  config: ConcordiumFacilitatorConfig,
): x402Facilitator {
  const scheme = new ExactConcordiumScheme({
    client: config.client,
    requireFinalization: config.requireFinalization,
    finalizationTimeoutMs: config.finalizationTimeoutMs,
  });

  // Register V2 (CAIP-2 format)
  const v2Networks = config.networks?.length ? config.networks : (["ccd:*"] as Network[]);
  for (const network of v2Networks) {
    facilitator.register(network, scheme);
  }

  // Register all V1 networks
  const v1Scheme: SchemeNetworkFacilitator = new ExactConcordiumSchemeV1Facilitator({
    client: config.client,
    requireFinalization: config.requireFinalization,
    finalizationTimeoutMs: config.finalizationTimeoutMs,
  });

  CONCORDIUM_V1_NETWORKS.forEach(network => {
    facilitator.registerV1(network as Network, v1Scheme);
  });

  return facilitator;
}
