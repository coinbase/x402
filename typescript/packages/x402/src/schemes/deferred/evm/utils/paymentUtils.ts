import { safeBase64Encode, safeBase64Decode } from "../../../../shared";
import { PaymentPayload } from "../../../../types/verify";
import { DeferredPaymentPayloadSchema } from "../../../../types/verify/schemes/deferred";

/**
 * Encodes a payment payload into a base64 string, ensuring bigint values are properly stringified
 *
 * @param payment - The payment payload to encode
 * @returns A base64 encoded string representation of the payment payload
 */
export function encodePayment(payment: PaymentPayload): string {
  const deferredPayment = DeferredPaymentPayloadSchema.parse(payment);
  const safe = {
    ...deferredPayment,
    payload: {
      ...payment.payload,
      voucher: Object.fromEntries(
        Object.entries(deferredPayment.payload.voucher).map(([key, value]) => [
          key,
          typeof value === "bigint" ? (value as bigint).toString() : value,
        ]),
      ),
    },
  };
  return safeBase64Encode(JSON.stringify(safe));
}

/**
 * Decodes a base64 encoded payment string back into a PaymentPayload object
 *
 * @param payment - The base64 encoded payment string to decode
 * @returns The decoded and validated PaymentPayload object
 */
export function decodePayment(payment: string): PaymentPayload {
  const decoded = safeBase64Decode(payment);
  const parsed = JSON.parse(decoded);

  const obj = {
    ...parsed,
    payload: {
      signature: parsed.payload.signature,
      voucher: {
        ...parsed.payload.voucher,
      },
    },
  };

  const validated = DeferredPaymentPayloadSchema.parse(obj);
  return validated;
}
