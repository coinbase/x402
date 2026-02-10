/**
 * One-call SIWX header verification.
 *
 * Combines parse → validate → verify into a single function for
 * servers that handle SIWX auth directly (e.g. auth-only endpoints).
 */

import type { SIWxVerifyResult, SIWxVerifyOptions } from "./types";
import { parseSIWxHeader } from "./parse";
import { validateSIWxMessage } from "./validate";
import { verifySIWxSignature } from "./verify";

/**
 * Parse, validate, and verify a SIWX header in one call.
 *
 * @param header - Raw base64-encoded `sign-in-with-x` header value
 * @param resourceUri - Expected resource URI (for domain/URI validation)
 * @param options - Optional verification options (e.g. evmVerifier for smart wallets)
 * @returns Verification result with `valid`, `address`, and optional `error`
 *
 * @example
 * ```typescript
 * const header = req.headers["sign-in-with-x"];
 * const result = await verifySIWxHeader(header, "https://api.example.com/profile");
 * if (result.valid) {
 *   console.log(`Authenticated: ${result.address}`);
 * }
 * ```
 */
export async function verifySIWxHeader(
  header: string,
  resourceUri: string,
  options?: SIWxVerifyOptions,
): Promise<SIWxVerifyResult> {
  let parsed;
  try {
    parsed = parseSIWxHeader(header);
  } catch (e) {
    return { valid: false, error: `Parse error: ${(e as Error).message}` };
  }

  const validation = await validateSIWxMessage(parsed, resourceUri);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  return verifySIWxSignature(parsed, options);
}
