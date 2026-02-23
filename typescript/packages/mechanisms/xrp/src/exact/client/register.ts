/**
 * XRP Client Registration
 * 
 * Convenience functions for registering the XRP exact scheme with x402 clients
 */

import { x402Client } from "@x402/core/client";
import { ExactXrpScheme } from "./scheme";
import { ClientXrpSigner } from "../../types";

export interface XrpClientConfig {
  /** The XRP signer for client operations */
  signer: ClientXrpSigner;
  /** XRPL server URL (defaults to testnet) */
  serverUrl?: string;
  /** Payment policies to apply */
  policies?: Array<{
    kind: string;
    evaluate: (req: { resource: string; amount: string }) => Promise<boolean> | boolean;
  }>;
}

/**
 * Register the XRP exact scheme with the x402 client
 *
 * @param config - Configuration for the XRP client
 * @returns Configured x402Client instance
 *
 * @example
 * ```typescript
 * import { registerExactXrpScheme } from "@x402/xrp/exact/client";
 * import { toClientXrpSigner } from "@x402/xrp";
 * import { Wallet } from "xrpl";
 *
 * const wallet = Wallet.fromSeed("sn3nxiW7v8KXzPzAqzwHXhSSKNyN");
 * const signer = toClientXrpSigner(wallet);
 *
 * const client = registerExactXrpScheme({
 *   signer,
 *   serverUrl: "wss://testnet.xrpl-labs.com",
 * });
 *
 * // Now ready to make XRP payments via x402
 * ```
 */
export function registerExactXrpScheme(config: XrpClientConfig): typeof x402Client.prototype {
  const xrpScheme = new ExactXrpScheme(config.signer, config.serverUrl);

  const client = new x402Client().register("xrp:*", xrpScheme);

  // Apply policies if provided
  if (config.policies) {
    for (const policy of config.policies) {
      client.addPolicy(policy);
    }
  }

  return client;
}
