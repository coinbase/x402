/**
 * Server-side declaration helper for SIWX extension
 *
 * Helps servers declare SIWX authentication requirements in PaymentRequired responses.
 */

import { randomBytes } from "crypto";
import type {
  SIWxExtension,
  SIWxExtensionInfo,
  DeclareSIWxOptions,
  SignatureType,
  SupportedChain,
} from "./types";
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
 * Create SIWX extension declaration for PaymentRequired.extensions
 *
 * Supports both single-chain and multi-chain configurations:
 * - Single-chain: Pass string for network
 * - Multi-chain: Pass array for network
 *
 * All chains share the same message metadata (domain, uri, nonce, etc.)
 * and are listed in the supportedChains array.
 *
 * Time-based fields (nonce, issuedAt, expirationTime) are generated per-request
 * by the enrichDeclaration hook when siwxResourceServerExtension is registered.
 *
 * @param options - Configuration options
 * @returns Extension object ready for PaymentRequired.extensions
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

  // Generate time-based fields for standalone usage (tests, etc.)
  // enrichDeclaration hook will override these per-request when extension is registered
  const expirationSeconds = options.expirationSeconds;
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();

  // Build shared info (no chain-specific fields)
  const info: SIWxExtensionInfo = {
    domain: options.domain,
    uri: options.resourceUri,
    version: options.version ?? "1",
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

  // Build supportedChains array from network(s)
  const supportedChains: SupportedChain[] = networks.map(network => ({
    chainId: network,
    type: getSignatureType(network),
  }));

  const extension: SIWxExtension & { _metadata?: { expirationSeconds?: number } } = {
    info,
    supportedChains,
    schema: buildSIWxSchema(),
    _metadata: {
      expirationSeconds: options.expirationSeconds,
    },
  };

  // Always use simple key (no namespacing)
  return { [SIGN_IN_WITH_X]: extension };
}
