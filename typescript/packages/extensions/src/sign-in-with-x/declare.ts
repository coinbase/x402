/**
 * Server-side declaration helper for SIWX extension
 *
 * Helps servers declare SIWX authentication requirements in PaymentRequired responses.
 */

import { randomBytes } from "crypto";
import type { SIWxExtension, SIWxExtensionInfo, DeclareSIWxOptions, SignatureType } from "./types";
import { SIGN_IN_WITH_X } from "./types";
import { buildSIWxSchema } from "./schema";

/**
 * Derive signature type from network.
 *
 * @param network - CAIP-2 network identifier
 * @returns Signature algorithm type
 */
function getSignatureType(network: string): SignatureType {
  return network.startsWith("solana:") ? "ed25519" : "eip191";
}

/**
 * Create SIWX extension declaration(s) for PaymentRequired.extensions
 *
 * Supports both single-chain and multi-chain configurations:
 * - Single-chain: Pass string for network → Returns { "sign-in-with-x": {...} }
 * - Multi-chain: Pass array for network → Returns { "sign-in-with-x:eip155:8453": {...}, ... }
 *
 * Time-based fields (nonce, issuedAt, expirationTime) are generated per-request
 * by the enrichDeclaration hook when siwxResourceServerExtension is registered.
 *
 * @param options - Configuration options
 * @returns Extension object(s) ready for PaymentRequired.extensions
 *
 * @example
 * ```typescript
 * // Single-chain
 * const extensions = declareSIWxExtension({
 *   domain: 'api.example.com',
 *   resourceUri: 'https://api.example.com/data',
 *   network: 'eip155:8453',
 *   expirationSeconds: 300,
 * });
 *
 * // Multi-chain (EVM + Solana)
 * const extensions = declareSIWxExtension({
 *   domain: 'api.example.com',
 *   resourceUri: 'https://api.example.com/data',
 *   network: ['eip155:8453', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
 *   expirationSeconds: 300,
 * });
 * ```
 */
export function declareSIWxExtension(options: DeclareSIWxOptions): Record<string, SIWxExtension> {
  const networks = Array.isArray(options.network) ? options.network : [options.network];
  const isSingleChain = !Array.isArray(options.network);

  const extensions: Record<string, SIWxExtension> = {};

  for (const network of networks) {
    // Generate time-based fields for standalone usage (tests, etc.)
    // enrichDeclaration hook will override these per-request when extension is registered
    const expirationSeconds = options.expirationSeconds;
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date().toISOString();

    const info: SIWxExtensionInfo = {
      domain: options.domain,
      uri: options.resourceUri,
      version: options.version ?? "1",
      chainId: network,
      type: getSignatureType(network),
      nonce,
      issuedAt,
      resources: [options.resourceUri],
    };

    // Only include expirationTime if duration specified (undefined = infinite)
    if (expirationSeconds !== undefined) {
      info.expirationTime = new Date(Date.now() + expirationSeconds * 1000).toISOString();
    }

    // Add optional fields if provided
    if (options.statement) {
      info.statement = options.statement;
    }
    if (options.signatureScheme) {
      info.signatureScheme = options.signatureScheme;
    }

    const extension: SIWxExtension & { _metadata?: { expirationSeconds?: number } } = {
      info,
      schema: buildSIWxSchema(),
      _metadata: {
        expirationSeconds: options.expirationSeconds,
      },
    };

    // Use simple key for single-chain, namespaced key for multi-chain
    const key = isSingleChain ? SIGN_IN_WITH_X : `${SIGN_IN_WITH_X}:${network}`;
    extensions[key] = extension;
  }

  return extensions;
}
