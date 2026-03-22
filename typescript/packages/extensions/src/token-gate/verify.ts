/**
 * Server-side proof verification for token-gate extension
 *
 * Verifies EIP-191 (EVM) or ed25519 (Solana) signatures and checks proof freshness.
 */

import { verifyMessage } from "viem";
import nacl from "tweetnacl";
import { base58 } from "@scure/base";
import type { TokenGateProof } from "./types";
import { DEFAULT_PROOF_MAX_AGE } from "./types";
import { buildProofMessage } from "./sign";

export interface TokenGateVerifyResult {
  valid: boolean;
  address?: string;
  error?: string;
}

/**
 * Verify a token-gate proof.
 *
 * Checks:
 * 1. Proof is not expired (issuedAt within proofMaxAge seconds)
 * 2. issuedAt is not in the future
 * 3. Signature is valid for the claimed address (EIP-191 or ed25519)
 *
 * @param proof - The parsed TokenGateProof from the request header
 * @param expectedDomain - The server's domain (must match proof.domain)
 * @param proofMaxAgeSeconds - Maximum accepted age of the proof (default: 300)
 * @returns Verification result with recovered/confirmed address on success
 */
export async function verifyTokenGateProof(
  proof: TokenGateProof,
  expectedDomain: string,
  proofMaxAgeSeconds = DEFAULT_PROOF_MAX_AGE,
): Promise<TokenGateVerifyResult> {
  // Domain binding check
  if (proof.domain !== expectedDomain) {
    return {
      valid: false,
      error: `Domain mismatch: expected "${expectedDomain}", got "${proof.domain}"`,
    };
  }

  // Parse and validate issuedAt
  const issuedAt = new Date(proof.issuedAt);
  if (isNaN(issuedAt.getTime())) {
    return { valid: false, error: "Invalid issuedAt timestamp" };
  }

  const ageMs = Date.now() - issuedAt.getTime();

  if (ageMs < 0) {
    return { valid: false, error: "issuedAt is in the future" };
  }

  if (ageMs > proofMaxAgeSeconds * 1000) {
    return {
      valid: false,
      error: `Proof expired: ${Math.round(ageMs / 1000)}s exceeds ${proofMaxAgeSeconds}s limit`,
    };
  }

  const message = buildProofMessage(proof.domain, proof.issuedAt);

  if (proof.signatureType === "ed25519") {
    return verifyEd25519Proof(proof, message);
  }

  // Default: EIP-191
  return verifyEip191Proof(proof, message);
}

/**
 * Verifies an EIP-191 (personal_sign) token-gate proof.
 *
 * @param proof - Token-gate proof to verify
 * @param message - Canonical message that was signed
 * @returns Verification result with address if valid
 */
async function verifyEip191Proof(
  proof: TokenGateProof,
  message: string,
): Promise<TokenGateVerifyResult> {
  try {
    const valid = await verifyMessage({
      address: proof.address as `0x${string}`,
      message,
      signature: proof.signature as `0x${string}`,
    });

    if (!valid) {
      return { valid: false, error: "Signature verification failed" };
    }

    return { valid: true, address: proof.address };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Signature verification failed",
    };
  }
}

/**
 * Verifies an ed25519 token-gate proof (Solana).
 *
 * @param proof - Token-gate proof to verify
 * @param message - Canonical message that was signed
 * @returns Verification result with address if valid
 */
function verifyEd25519Proof(proof: TokenGateProof, message: string): TokenGateVerifyResult {
  try {
    const sigBytes = base58.decode(proof.signature);
    const pubkeyBytes = base58.decode(proof.address);
    const msgBytes = new TextEncoder().encode(message);

    const valid = nacl.sign.detached.verify(msgBytes, sigBytes, pubkeyBytes);
    if (!valid) {
      return { valid: false, error: "Signature verification failed" };
    }

    return { valid: true, address: proof.address };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "ed25519 verification failed",
    };
  }
}
