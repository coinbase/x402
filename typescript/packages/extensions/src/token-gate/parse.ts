/**
 * Header parsing for token-gate extension
 *
 * Parses the token-gate request header (base64-encoded JSON).
 */

import { safeBase64Decode, Base64EncodedRegex } from "@x402/core/utils";
import type { TokenGateProof } from "./types";
import { TokenGateProofSchema } from "./types";

/**
 * Parse the `token-gate` header value into a structured proof.
 *
 * @param header - Base64-encoded JSON token-gate header value
 * @returns Parsed TokenGateProof
 * @throws Error if the header is invalid or missing required fields
 */
export function parseTokenGateHeader(header: string): TokenGateProof {
  if (!Base64EncodedRegex.test(header)) {
    throw new Error("Invalid token-gate header: not valid base64");
  }

  const jsonStr = safeBase64Decode(header);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error("Invalid token-gate header: not valid JSON");
  }

  const parsed = TokenGateProofSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid token-gate header: ${issues}`);
  }

  return parsed.data as TokenGateProof;
}
