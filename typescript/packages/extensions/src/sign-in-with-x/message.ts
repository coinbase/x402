/**
 * CAIP-122 message construction for SIWX extension
 *
 * Constructs the canonical message string for signing.
 * Uses siwe library for EIP-4361 compliant message format.
 */

import { SiweMessage } from "siwe";
import type { SIWxExtensionInfo } from "./types";

/**
 * Construct EIP-4361 compliant message string for signing.
 *
 * Uses the siwe library to ensure message format matches verification.
 *
 * @param serverInfo - Server-provided extension info
 * @param address - Client wallet address
 * @returns Message string ready for signing
 *
 * @example
 * ```typescript
 * const serverInfo = paymentRequired.extensions['sign-in-with-x'].info;
 * const message = createSIWxMessage(serverInfo, wallet.address);
 * const signature = await wallet.signMessage({ message });
 * ```
 */
export function createSIWxMessage(serverInfo: SIWxExtensionInfo, address: string): string {
  // Parse CAIP-2 chainId (e.g., "eip155:8453" -> 8453)
  const chainIdMatch = /^eip155:(\d+)$/.exec(serverInfo.chainId);
  if (!chainIdMatch) {
    throw new Error(`Unsupported chainId format: ${serverInfo.chainId}. Expected eip155:<number>`);
  }
  const numericChainId = parseInt(chainIdMatch[1], 10);

  const siweMessage = new SiweMessage({
    domain: serverInfo.domain,
    address,
    statement: serverInfo.statement,
    uri: serverInfo.uri,
    version: serverInfo.version,
    chainId: numericChainId,
    nonce: serverInfo.nonce,
    issuedAt: serverInfo.issuedAt,
    expirationTime: serverInfo.expirationTime,
    notBefore: serverInfo.notBefore,
    requestId: serverInfo.requestId,
    resources: serverInfo.resources,
  });

  return siweMessage.prepareMessage();
}
