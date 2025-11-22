import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from ".";
import { SettleResponse } from "../types";
import { PaymentPayload, PaymentRequired } from "../types/payments";
import { x402Client } from "../client/x402Client";

/**
 * HTTP-specific client for handling x402 payment protocol over HTTP.
 *
 * Wraps a x402Client to provide HTTP-specific encoding/decoding functionality
 * for payment headers and responses while maintaining the builder pattern.
 */
export class x402HTTPClient {
  /**
   * Creates a new x402HTTPClient instance.
   *
   * @param client - The underlying x402Client for payment logic
   */
  constructor(private readonly client: x402Client) {}

  /**
   * Encodes a payment payload into appropriate HTTP headers based on version.
   *
   * @param paymentPayload - The payment payload to encode
   * @returns HTTP headers containing the encoded payment signature
   */
  encodePaymentSignatureHeader(paymentPayload: PaymentPayload): Record<string, string> {
    switch (paymentPayload.x402Version) {
      case 2:
        return {
          "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(paymentPayload),
        };
      case 1:
        return {
          "X-PAYMENT": encodePaymentSignatureHeader(paymentPayload),
        };
      default:
        throw new Error(
          `Unsupported x402 version: ${(paymentPayload as PaymentPayload).x402Version}`,
        );
    }
  }

  /**
   * Extracts payment required information from HTTP response.
   *
   * @param getHeader - Function to retrieve header value by name (case-insensitive)
   * @param body - Optional response body for v1 compatibility
   * @returns The payment required object
   */
  getPaymentRequiredResponse(
    getHeader: (name: string) => string | null | undefined,
    body?: unknown,
  ): PaymentRequired {
    // v2
    const paymentRequired = getHeader("PAYMENT-REQUIRED");
    if (paymentRequired) {
      return decodePaymentRequiredHeader(paymentRequired);
    }

    // v1
    if (
      body &&
      body instanceof Object &&
      "x402Version" in body &&
      (body as PaymentRequired).x402Version === 1
    ) {
      return body as PaymentRequired;
    }

    throw new Error("Invalid payment required response");
  }

  /**
   * Extracts payment settlement response from HTTP headers.
   *
   * @param getHeader - Function to retrieve header value by name (case-insensitive)
   * @returns The settlement response object
   */
  getPaymentSettleResponse(getHeader: (name: string) => string | null | undefined): SettleResponse {
    // v2
    const paymentResponse = getHeader("PAYMENT-RESPONSE");
    if (paymentResponse) {
      return decodePaymentResponseHeader(paymentResponse);
    }

    // v1
    const xPaymentResponse = getHeader("X-PAYMENT-RESPONSE");
    if (xPaymentResponse) {
      return decodePaymentResponseHeader(xPaymentResponse);
    }

    throw new Error("Payment response header not found");
  }

  /**
   * Creates a payment payload for the given payment requirements.
   * Delegates to the underlying x402Client.
   *
   * @param paymentRequired - The payment required response from the server
   * @returns Promise resolving to the payment payload
   */
  async createPaymentPayload(paymentRequired: PaymentRequired): Promise<PaymentPayload> {
    return this.client.createPaymentPayload(paymentRequired);
  }
}
