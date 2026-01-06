/**
 * CAIP-122 message construction for SIWX extension
 *
 * Constructs the canonical message string for signing.
 * Per https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-122.md
 */

import type { SIWxExtensionInfo } from "./types";

/**
 * Construct CAIP-122 compliant message string for signing.
 *
 * The message format follows the EIP-4361 / CAIP-122 structure:
 *
 * ```
 * ${domain} wants you to sign in with your ${chainId} account:
 * ${address}
 *
 * ${statement}
 *
 * URI: ${uri}
 * Version: ${version}
 * Chain ID: ${chainId}
 * Nonce: ${nonce}
 * Issued At: ${issuedAt}
 * [Expiration Time: ${expirationTime}]
 * [Not Before: ${notBefore}]
 * [Request ID: ${requestId}]
 * [Resources:
 * - ${resource1}
 * - ${resource2}]
 * ```
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
  const lines: string[] = [];

  // Header
  lines.push(`${serverInfo.domain} wants you to sign in with your ${serverInfo.chainId} account:`);
  lines.push(address);
  lines.push("");

  // Statement (optional)
  if (serverInfo.statement) {
    lines.push(serverInfo.statement);
    lines.push("");
  }

  // Required fields
  lines.push(`URI: ${serverInfo.uri}`);
  lines.push(`Version: ${serverInfo.version}`);
  lines.push(`Chain ID: ${serverInfo.chainId}`);
  lines.push(`Nonce: ${serverInfo.nonce}`);
  lines.push(`Issued At: ${serverInfo.issuedAt}`);

  // Optional fields
  if (serverInfo.expirationTime) {
    lines.push(`Expiration Time: ${serverInfo.expirationTime}`);
  }
  if (serverInfo.notBefore) {
    lines.push(`Not Before: ${serverInfo.notBefore}`);
  }
  if (serverInfo.requestId) {
    lines.push(`Request ID: ${serverInfo.requestId}`);
  }

  // Resources
  if (serverInfo.resources && serverInfo.resources.length > 0) {
    lines.push("Resources:");
    for (const resource of serverInfo.resources) {
      lines.push(`- ${resource}`);
    }
  }

  return lines.join("\n");
}
