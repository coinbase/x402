import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from ".";
import { SettleResponse } from "../types";
import { PaymentPayload, PaymentRequired } from "../types/payments";
import { x402Client } from "../client/x402Client";

/**
 *
 */
export class x402HTTPClient extends x402Client {
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
   * @param headers - The HTTP response headers
   * @param body - Optional response body for v1 compatibility
   * @returns The payment required object
   */
  getPaymentRequiredResponse(headers: Record<string, string>, body?: unknown): PaymentRequired {
    // v2
    if (headers["PAYMENT-REQUIRED"]) {
      return decodePaymentRequiredHeader(headers["PAYMENT-REQUIRED"]);
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
   * @param headers - The HTTP response headers
   * @returns The settlement response object
   */
  getPaymentSettleResponse(headers: Record<string, string>): SettleResponse {
    // v2
    if (headers["PAYMENT-RESPONSE"]) {
      return decodePaymentResponseHeader(headers["PAYMENT-RESPONSE"]);
    }

    // v1
    if (headers["X-PAYMENT-RESPONSE"]) {
      return decodePaymentResponseHeader(headers["X-PAYMENT-RESPONSE"]);
    }

    throw new Error("Payment response header not found");
  }
}
