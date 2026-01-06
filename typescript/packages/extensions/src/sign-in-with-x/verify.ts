/**
 * Signature verification for SIWX extension
 *
 * Cryptographically verifies SIWX signatures.
 * Currently supports EVM (eip191). Extensible for other schemes.
 */

import { SiweMessage } from "siwe";
import type { SIWxPayload, SIWxVerifyResult, SIWxVerifyOptions } from "./types";

/**
 * Verify SIWX signature cryptographically.
 *
 * Reconstructs the SIWE message from payload fields and verifies
 * the signature matches the claimed address.
 *
 * @param payload - The SIWX payload containing signature
 * @param options - Verification options
 * @returns Verification result with recovered address if valid
 *
 * @example
 * ```typescript
 * const payload = parseSIWxHeader(header);
 * const result = await verifySIWxSignature(payload);
 *
 * if (result.valid) {
 *   console.log('Verified wallet:', result.address);
 * } else {
 *   console.error('Verification failed:', result.error);
 * }
 * ```
 */
export async function verifySIWxSignature(
  payload: SIWxPayload,
  options: SIWxVerifyOptions = {},
): Promise<SIWxVerifyResult> {
  try {
    // Parse CAIP-2 chainId (e.g., "eip155:8453" -> 8453)
    const chainIdMatch = /^eip155:(\d+)$/.exec(payload.chainId);
    if (!chainIdMatch) {
      // TODO: Add support for solana:*, cosmos:*, etc.
      return {
        valid: false,
        error: `Unsupported chainId namespace: ${payload.chainId}. Currently only eip155:* is supported.`,
      };
    }
    const numericChainId = parseInt(chainIdMatch[1], 10);

    // Reconstruct SIWE message for verification
    const siweMessage = new SiweMessage({
      domain: payload.domain,
      address: payload.address,
      statement: payload.statement,
      uri: payload.uri,
      version: payload.version,
      chainId: numericChainId,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expirationTime: payload.expirationTime,
      notBefore: payload.notBefore,
      requestId: payload.requestId,
      resources: payload.resources,
    });

    // Verify signature
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyOptions: any = {
      signature: payload.signature,
    };

    // Add provider for smart wallet verification if enabled
    if (options.checkSmartWallet && options.provider) {
      verifyOptions.provider = options.provider;
    }

    const result = await siweMessage.verify(verifyOptions);

    if (!result.success) {
      // SiweError type - extract error details
      const errorMessage = result.error
        ? String(result.error)
        : "Signature verification failed";
      return {
        valid: false,
        error: errorMessage,
      };
    }

    return {
      valid: true,
      address: siweMessage.address,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}
