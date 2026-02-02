/**
 * Client-side utilities for the Payment-Identifier Extension
 */

import type { PaymentIdentifierExtension } from "./types";
import { paymentIdentifierSchema } from "./schema";
import { generatePaymentId, isValidPaymentId } from "./utils";

/**
 * Creates a payment-identifier extension payload for inclusion in PaymentPayload.extensions.
 *
 * @param id - Optional custom payment ID. If not provided, a new ID will be generated.
 * @returns A PaymentIdentifierExtension object ready for PaymentPayload.extensions
 * @throws Error if the provided ID is invalid
 *
 * @example
 * ```typescript
 * import { createPaymentIdentifierPayload, PAYMENT_IDENTIFIER } from '@x402/extensions/payment-identifier';
 *
 * // Auto-generate an ID
 * const extension = createPaymentIdentifierPayload();
 *
 * // Use a custom ID
 * const extension = createPaymentIdentifierPayload("pay_my_custom_id_12345");
 *
 * // Include in PaymentPayload
 * const paymentPayload = {
 *   x402Version: 2,
 *   resource: { ... },
 *   accepted: { ... },
 *   payload: { ... },
 *   extensions: {
 *     [PAYMENT_IDENTIFIER]: extension
 *   }
 * };
 * ```
 */
export function createPaymentIdentifierPayload(id?: string): PaymentIdentifierExtension {
  const paymentId = id ?? generatePaymentId();

  if (!isValidPaymentId(paymentId)) {
    throw new Error(
      `Invalid payment ID: "${paymentId}". ` +
        `ID must be 16-128 characters and contain only alphanumeric characters, hyphens, and underscores.`,
    );
  }

  return {
    info: {
      id: paymentId,
    },
    schema: paymentIdentifierSchema,
  };
}
