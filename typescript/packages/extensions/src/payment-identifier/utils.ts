/**
 * Utility functions for the Payment-Identifier Extension
 */

import { createHash } from "crypto";
import type { PaymentPayload } from "@x402/core/types";
import { PAYMENT_ID_MIN_LENGTH, PAYMENT_ID_MAX_LENGTH, PAYMENT_ID_PATTERN } from "./types";

/**
 * Generates a unique payment identifier.
 *
 * @param prefix - Optional prefix for the ID (e.g., "pay_"). Defaults to "pay_".
 * @returns A unique payment identifier string
 *
 * @example
 * ```typescript
 * // With default prefix
 * const id = generatePaymentId(); // "pay_7d5d747be160e280504c099d984bcfe0"
 *
 * // With custom prefix
 * const id = generatePaymentId("txn_"); // "txn_7d5d747be160e280504c099d984bcfe0"
 *
 * // Without prefix
 * const id = generatePaymentId(""); // "7d5d747be160e280504c099d984bcfe0"
 * ```
 */
export function generatePaymentId(prefix: string = "pay_"): string {
  // Generate UUID v4 without hyphens (32 hex chars)
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}${uuid}`;
}

/**
 * Computes a deterministic fingerprint of a PaymentPayload.
 * This allows detecting whether two payloads with the same payment ID carry
 * identical or different content (for 409 Conflict detection).
 *
 * @param payload - The payment payload to fingerprint
 * @returns Hex-encoded SHA-256 hash of the canonical payload
 */
export function payloadFingerprint(payload: PaymentPayload): string {
  // JSON.stringify with a replacer that sorts keys at every level for determinism
  const canonical = JSON.stringify(payload, (_key, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Validates that a payment ID meets the format requirements.
 *
 * @param id - The payment ID to validate
 * @returns True if the ID is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidPaymentId("pay_7d5d747be160e280"); // true (exactly 16 chars after prefix removal check)
 * isValidPaymentId("abc"); // false (too short)
 * isValidPaymentId("pay_abc!@#"); // false (invalid characters)
 * ```
 */
export function isValidPaymentId(id: string): boolean {
  if (typeof id !== "string") {
    return false;
  }

  if (id.length < PAYMENT_ID_MIN_LENGTH || id.length > PAYMENT_ID_MAX_LENGTH) {
    return false;
  }

  return PAYMENT_ID_PATTERN.test(id);
}
