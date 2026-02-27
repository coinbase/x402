/**
 * Per-request SIWX challenge generator for auth-only endpoints.
 *
 * Unlike declareSIWxExtension (which creates a static declaration enriched
 * per-request by the payment pipeline), createSIWxChallenge produces a
 * complete, ready-to-send challenge with nonce/issuedAt/expirationTime.
 *
 * Use this for endpoints that require wallet authentication without payment
 * (i.e. accepts: [] or no payment middleware).
 */

import { randomBytes } from "crypto";
import type { SIWxExtension, SIWxExtensionInfo, SupportedChain } from "./types";
import { SIGN_IN_WITH_X } from "./types";
import { getSignatureType } from "./declare";
import { buildSIWxSchema } from "./schema";

/**
 * Options for creating a per-request SIWX challenge.
 *
 * All identification fields are required since there is no enrichment
 * pipeline to derive them from request context.
 */
export interface SIWxChallengeOptions {
  /** Server's domain (e.g. "api.example.com" or "localhost:4021") */
  domain: string;
  /** Full resource URI (e.g. "https://api.example.com/profile") */
  resourceUri: string;
  /**
   * Network(s) to support.
   * - Single chain: "eip155:8453"
   * - Multi-chain: ["eip155:8453", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]
   */
  network: string | string[];
  /** Human-readable purpose for signing */
  statement?: string;
  /**
   * Expiration duration in seconds.
   * - Number (e.g., 300): Challenge expires after this many seconds
   * - undefined: No expiration
   */
  expirationSeconds?: number;
  /** CAIP-122 version (default: "1") */
  version?: string;
}

/**
 * Create a complete SIWX challenge for auth-only endpoints.
 *
 * Generates a fresh nonce, issuedAt, and (optionally) expirationTime on
 * every call. The returned object is ready to include in a 402 response
 * body as `{ extensions: createSIWxChallenge(...) }`.
 *
 * @param options - Challenge configuration (domain, resourceUri, network required)
 * @returns Extension object keyed by "sign-in-with-x"
 *
 * @example
 * ```typescript
 * // Auth-only endpoint handler
 * app.get("/profile", async (req, res) => {
 *   const siwxHeader = req.headers["sign-in-with-x"];
 *   if (!siwxHeader) {
 *     return res.status(402).json({
 *       extensions: createSIWxChallenge({
 *         domain: "api.example.com",
 *         resourceUri: "https://api.example.com/profile",
 *         network: "eip155:8453",
 *         statement: "Sign in to view your profile",
 *         expirationSeconds: 300,
 *       }),
 *     });
 *   }
 *   // ... verify header
 * });
 * ```
 */
export function createSIWxChallenge(
  options: SIWxChallengeOptions,
): Record<string, SIWxExtension> {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const expirationTime =
    options.expirationSeconds !== undefined
      ? new Date(Date.now() + options.expirationSeconds * 1000).toISOString()
      : undefined;

  const info: SIWxExtensionInfo = {
    domain: options.domain,
    uri: options.resourceUri,
    version: options.version ?? "1",
    nonce,
    issuedAt,
    resources: [options.resourceUri],
  };

  if (expirationTime) {
    info.expirationTime = expirationTime;
  }
  if (options.statement) {
    info.statement = options.statement;
  }

  const networks = Array.isArray(options.network) ? options.network : [options.network];
  const supportedChains: SupportedChain[] = networks.map(network => ({
    chainId: network,
    type: getSignatureType(network),
  }));

  return {
    [SIGN_IN_WITH_X]: {
      info,
      supportedChains,
      schema: buildSIWxSchema(),
    },
  };
}
