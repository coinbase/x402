/**
 * Header encoding for token-gate extension
 *
 * Encodes a TokenGateProof for the `token-gate` HTTP header.
 */

import { safeBase64Encode } from "@x402/core/utils";
import type { TokenGateProof } from "./types";

/**
 * Encode a TokenGateProof for the `token-gate` request header.
 *
 * @param proof - Complete proof with signature
 * @returns Base64-encoded JSON string
 */
export function encodeTokenGateHeader(proof: TokenGateProof): string {
  return safeBase64Encode(JSON.stringify(proof));
}
