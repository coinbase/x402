/**
 * Header parsing for SIWX extension
 *
 * Parses the SIGN-IN-WITH-X header from client requests.
 * Supports both base64-encoded (spec) and raw JSON (backwards compat).
 */

import { Base64EncodedRegex, safeBase64Decode } from "@x402/core/utils";
import { SIWxPayloadSchema, type SIWxPayload } from "./types";

/**
 * Parse SIGN-IN-WITH-X header into structured payload.
 *
 * Supports both:
 * - Base64-encoded JSON (spec-compliant, per CHANGELOG-v2.md line 335)
 * - Raw JSON (backwards compatibility)
 *
 * @param header - The SIGN-IN-WITH-X header value
 * @returns Parsed SIWX payload
 * @throws Error if header is invalid or missing required fields
 *
 * @example
 * ```typescript
 * const header = request.headers.get('SIGN-IN-WITH-X');
 * if (header) {
 *   const payload = parseSIWxHeader(header);
 *   // payload.address, payload.signature, etc.
 * }
 * ```
 */
export function parseSIWxHeader(header: string): SIWxPayload {
  let jsonStr: string;

  // Try base64 decode first (spec-compliant)
  if (Base64EncodedRegex.test(header)) {
    try {
      jsonStr = safeBase64Decode(header);
    } catch {
      // If base64 decode fails, treat as raw JSON
      jsonStr = header;
    }
  } else {
    // Fall back to raw JSON (backwards compatibility)
    jsonStr = header;
  }

  // Parse JSON
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(jsonStr);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid SIWX header: not valid JSON or base64-encoded JSON");
    }
    throw error;
  }

  // Validate with zod schema
  const parsed = SIWxPayloadSchema.safeParse(rawPayload);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid SIWX header: ${issues}`);
  }

  return parsed.data;
}
