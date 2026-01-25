import { PaymentPayload } from "@x402/core/types";

/**
 * Function type for generating idempotency keys from payment payloads
 */
export type KeyGeneratorFn = (payload: PaymentPayload) => string;

/**
 * Interface for idempotency key generation
 */
export interface IdempotencyKeyGenerator {
  /**
   * Generate an idempotency key for a payment payload.
   * Keys are deterministic - same payload produces same key.
   *
   * @param payload - The payment payload to generate a key for
   * @returns A deterministic, URL-safe idempotency key
   */
  generateKey(payload: PaymentPayload): string;
}
