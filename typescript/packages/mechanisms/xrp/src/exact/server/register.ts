/**
 * XRP Server Registration
 * 
 * Convenience functions for registering the XRP exact scheme with x402 servers
 */

import { x402ResourceServer } from "@x402/core/server";
import { ExactXrpScheme } from "./scheme";

export interface XrpResourceServerConfig {
  /** Payment policies to apply */
  policies?: Array<{
    kind: string;
    evaluate: (req: { resource: string; amount: string }) => Promise<boolean> | boolean;
  }>;
}

/**
 * Register the XRP exact scheme with the x402 resource server
 *
 * @param config - Optional configuration for the XRP server
 * @returns Configured x402ResourceServer instance
 *
 * @example
 * ```typescript
 * import { registerExactXrpScheme } from "@x402/xrp/exact/server";
 *
 * const server = registerExactXrpScheme();
 *
 * // Now ready to request XRP payments
 * const requirements = await server.buildRequirements({
 *   network: "xrp:testnet",
 *   amount: "$0.01",
 *   payTo: "rN7n7otQDd6FczFgLdlqtyMVrn3HMfHgFj",
 * });
 * ```
 */
export function registerExactXrpScheme(
  config: XrpResourceServerConfig = {},
): typeof x402ResourceServer.prototype {
  const xrpScheme = new ExactXrpScheme();

  const server = new x402ResourceServer().register("xrp:*", xrpScheme);

  // Apply policies if provided
  if (config.policies) {
    for (const policy of config.policies) {
      server.addPolicy(policy);
    }
  }

  return server;
}
