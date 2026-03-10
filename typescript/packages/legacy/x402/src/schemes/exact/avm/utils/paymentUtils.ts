import { safeBase64Encode, safeBase64Decode } from "../../../../shared";
import { SupportedAVMNetworks } from "../../../../types";
import { PaymentPayload, PaymentPayloadSchema } from "../../../../types/verify";
import { ExactAvmPayload } from "../types";

/**
 * Encodes an AVM payment payload into a base64 string
 *
 * @param payment - The payment payload to encode
 * @returns A base64 encoded string representation of the payment payload
 */
export function encodePayment(payment: PaymentPayload): string {
  if (!SupportedAVMNetworks.includes(payment.network)) {
    throw new Error("Invalid AVM network");
  }

  const safe: PaymentPayload = {
    ...payment,
    payload: payment.payload as ExactAvmPayload,
  };

  return safeBase64Encode(JSON.stringify(safe));
}

/**
 * Decodes a base64 encoded AVM payment string back into a PaymentPayload object
 *
 * @param payment - The base64 encoded payment string to decode
 * @returns The decoded and validated PaymentPayload object
 */
export function decodePayment(payment: string): PaymentPayload {
  const decoded = safeBase64Decode(payment);
  const parsed = JSON.parse(decoded);

  if (!SupportedAVMNetworks.includes(parsed.network)) {
    throw new Error("Invalid AVM network");
  }

  const obj: PaymentPayload = {
    ...parsed,
    payload: parsed.payload as ExactAvmPayload,
  };

  const validated = PaymentPayloadSchema.parse(obj);
  return validated;
}
