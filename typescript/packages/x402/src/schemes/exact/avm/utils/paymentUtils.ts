import { PaymentPayload } from "../../../../types/verify";

/**
 * Encodes a payment payload as a base64 string
 *
 * @param payment - The payment payload to encode
 * @returns A base64-encoded string representation of the payment payload
 */
export function encodePayment(payment: PaymentPayload): string {
  // Convert the payment payload to a JSON string
  const paymentString = JSON.stringify(payment);

  // Encode the string as base64
  return Buffer.from(paymentString).toString("base64");
}

/**
 * Decodes a base64-encoded payment payload
 *
 * @param encodedPayment - The base64-encoded payment payload
 * @returns The decoded payment payload
 */
export function decodePayment(encodedPayment: string): PaymentPayload {
  // Decode the base64 string to a JSON string
  const paymentString = Buffer.from(encodedPayment, "base64").toString();

  // Parse the JSON string to a payment payload
  return JSON.parse(paymentString) as PaymentPayload;
}
