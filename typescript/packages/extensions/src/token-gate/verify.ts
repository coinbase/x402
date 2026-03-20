/**
 * Server-side proof verification for token-gate extension
 *
 * Verifies EIP-191 signatures and checks proof freshness.
 */

import { verifyMessage } from "viem";
import type { TokenGateProof } from "./types";
import { DEFAULT_PROOF_MAX_AGE } from "./types";
import { buildProofMessage } from "./sign";

export interface TokenGateVerifyResult {
  valid: boolean;
  address?: `0x${string}`;
  error?: string;
}

/**
 * Verify a token-gate proof.
 *
 * Checks:
 * 1. Proof is not expired (issuedAt within proofMaxAge seconds)
 * 2. issuedAt is not in the future
 * 3. EIP-191 signature is valid for the claimed address
 *
 * @param proof - The parsed TokenGateProof from the request header
 * @param expectedDomain - The server's domain (must match proof.domain)
 * @param proofMaxAgeSeconds - Maximum accepted age of the proof (default: 300)
 * @returns Verification result with recovered address on success
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

  // Verify EIP-191 signature
  const message = buildProofMessage(proof.domain, proof.issuedAt);

  try {
    const valid = await verifyMessage({
      address: proof.address,
      message,
      signature: proof.signature,
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
