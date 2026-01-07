/**
 * Signature verification for SIWX extension
 *
 * Routes to chain-specific verification based on chainId namespace:
 * - EVM (eip155:*): Uses viem's verifyMessage with EIP-6492 smart wallet support
 * - Solana (solana:*): Uses Ed25519 signature verification via tweetnacl
 */

import { formatSIWEMessage, verifyEVMSignature } from "./evm";
import { formatSIWSMessage, verifySolanaSignature, decodeBase58 } from "./solana";
import type { SIWxPayload, SIWxVerifyResult } from "./types";

/**
 * Verify SIWX signature cryptographically.
 *
 * Routes to the appropriate chain-specific verification based on the
 * chainId namespace prefix:
 * - `eip155:*` → EVM verification with EIP-6492 smart wallet support
 * - `solana:*` → Ed25519 signature verification
 *
 * @param payload - The SIWX payload containing signature
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
): Promise<SIWxVerifyResult> {
  try {
    // Route by chain namespace
    if (payload.chainId.startsWith("eip155:")) {
      return verifyEVMPayload(payload);
    }

    if (payload.chainId.startsWith("solana:")) {
      return verifySolanaPayload(payload);
    }

    return {
      valid: false,
      error: `Unsupported chain namespace: ${payload.chainId}. Supported: eip155:* (EVM), solana:* (Solana)`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

/**
 * Verify EVM signature with EIP-6492 smart wallet support.
 *
 * Uses viem's verifyMessage which automatically handles:
 * - EOA signatures (standard ECDSA)
 * - EIP-1271 (deployed smart contract wallets)
 * - EIP-6492 (counterfactual/pre-deploy smart wallets)
 */
async function verifyEVMPayload(payload: SIWxPayload): Promise<SIWxVerifyResult> {
  // Reconstruct SIWE message for verification
  const message = formatSIWEMessage(
    {
      domain: payload.domain,
      uri: payload.uri,
      statement: payload.statement,
      version: payload.version,
      chainId: payload.chainId,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expirationTime: payload.expirationTime,
      notBefore: payload.notBefore,
      requestId: payload.requestId,
      resources: payload.resources,
    },
    payload.address,
  );

  try {
    const valid = await verifyEVMSignature(message, payload.address, payload.signature);

    if (!valid) {
      return {
        valid: false,
        error: "Signature verification failed",
      };
    }

    return {
      valid: true,
      address: payload.address,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Signature verification failed",
    };
  }
}

/**
 * Verify Solana Ed25519 signature.
 *
 * Reconstructs the SIWS message and verifies using tweetnacl.
 */
function verifySolanaPayload(payload: SIWxPayload): SIWxVerifyResult {
  // Reconstruct SIWS message
  const message = formatSIWSMessage(
    {
      domain: payload.domain,
      uri: payload.uri,
      statement: payload.statement,
      version: payload.version,
      chainId: payload.chainId,
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expirationTime: payload.expirationTime,
      notBefore: payload.notBefore,
      requestId: payload.requestId,
      resources: payload.resources,
    },
    payload.address,
  );

  // Decode Base58 signature and public key
  let signature: Uint8Array;
  let publicKey: Uint8Array;

  try {
    signature = decodeBase58(payload.signature);
    publicKey = decodeBase58(payload.address);
  } catch (error) {
    return {
      valid: false,
      error: `Invalid Base58 encoding: ${error instanceof Error ? error.message : "decode failed"}`,
    };
  }

  // Validate signature length (Ed25519 signatures are 64 bytes)
  if (signature.length !== 64) {
    return {
      valid: false,
      error: `Invalid signature length: expected 64 bytes, got ${signature.length}`,
    };
  }

  // Validate public key length (Ed25519 public keys are 32 bytes)
  if (publicKey.length !== 32) {
    return {
      valid: false,
      error: `Invalid public key length: expected 32 bytes, got ${publicKey.length}`,
    };
  }

  // Verify Ed25519 signature
  const valid = verifySolanaSignature(message, signature, publicKey);

  if (!valid) {
    return {
      valid: false,
      error: "Solana signature verification failed",
    };
  }

  return {
    valid: true,
    address: payload.address,
  };
}
