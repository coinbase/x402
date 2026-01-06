/**
 * Complete client flow for SIWX extension
 *
 * Combines message construction, signing, and payload creation.
 */

import type { SIWxExtensionInfo, SIWxPayload } from "./types";
import type { SIWxSigner } from "./sign";
import { createSIWxMessage } from "./message";
import { signSIWxMessage } from "./sign";

/**
 * Create a complete SIWX payload from server extension info.
 *
 * This function:
 * 1. Extracts the wallet address from the signer
 * 2. Constructs the CAIP-122 message
 * 3. Signs the message
 * 4. Returns the complete payload ready for encoding
 *
 * @param serverExtension - Server-provided extension info from PaymentRequired
 * @param signer - Wallet or account that can sign messages
 * @returns Complete SIWX payload with signature
 *
 * @example
 * ```typescript
 * // Get extension info from 402 response
 * const serverInfo = paymentRequired.extensions['sign-in-with-x'].info;
 *
 * // Create signed payload
 * const payload = await createSIWxPayload(serverInfo, wallet);
 *
 * // Encode for header
 * const header = encodeSIWxHeader(payload);
 *
 * // Send authenticated request
 * fetch(url, { headers: { 'SIGN-IN-WITH-X': header } });
 * ```
 */
export async function createSIWxPayload(
  serverExtension: SIWxExtensionInfo,
  signer: SIWxSigner,
): Promise<SIWxPayload> {
  // Get address from signer
  let address: string;
  if (signer.account?.address) {
    address = signer.account.address;
  } else if (signer.address) {
    address = signer.address;
  } else {
    throw new Error("Cannot determine signer address: no account or address property found");
  }

  // Construct CAIP-122 message
  const message = createSIWxMessage(serverExtension, address);

  // Sign message
  const signature = await signSIWxMessage(message, signer);

  // Return complete payload
  return {
    domain: serverExtension.domain,
    address,
    statement: serverExtension.statement,
    uri: serverExtension.uri,
    version: serverExtension.version,
    chainId: serverExtension.chainId,
    nonce: serverExtension.nonce,
    issuedAt: serverExtension.issuedAt,
    expirationTime: serverExtension.expirationTime,
    notBefore: serverExtension.notBefore,
    requestId: serverExtension.requestId,
    resources: serverExtension.resources,
    signature,
  };
}
