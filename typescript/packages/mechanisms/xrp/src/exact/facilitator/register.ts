/**
 * XRP Facilitator Registration
 * 
 * Convenience functions for registering the XRP exact scheme with x402 facilitators
 */

import { x402Facilitator } from "@x402/core/facilitator";
import { ExactXrpScheme, ExactXrpSchemeConfig } from "./scheme";
import { FacilitatorXrpSigner } from "../../types";

export interface XrpFacilitatorConfig {
  /** The XRP signer for facilitator operations */
  signer: FacilitatorXrpSigner;
  /** Optional scheme configuration */
  schemeConfig?: ExactXrpSchemeConfig;
}

/**
 * Register the XRP exact scheme with the x402 facilitator
 *
 * @param config - Configuration for the XRP facilitator
 * @returns Configured x402Facilitator instance
 *
 * @example
 * ```typescript
 * import { registerExactXrpScheme } from "@x402/xrp/exact/facilitator";
 * import { FacilitatorXrpClient, toFacilitatorXrpSigner } from "@x402/xrp";
 *
 * const client = new FacilitatorXrpClient({ server: "wss://testnet.xrpl-labs.com" });
 * await client.connect();
 * client.addAddress("rYourFacilitatorAddress...");
 *
 * const signer = toFacilitatorXrpSigner(client);
 *
 * const facilitator = registerExactXrpScheme({
 *   signer,
 *   schemeConfig: {
 *     autoFundDestinations: false,
 *   },
 * });
 *
 * // Now ready to verify and settle XRP payments
 * ```
 */
export function registerExactXrpScheme(
  config: XrpFacilitatorConfig,
): typeof x402Facilitator.prototype {
  const xrpScheme = new ExactXrpScheme(config.signer, config.schemeConfig);

  return new x402Facilitator().register("xrp:*", xrpScheme);
}
