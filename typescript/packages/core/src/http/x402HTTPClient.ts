import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from ".";
import { SettleResponse } from "../types";
import { PaymentPayload, PaymentRequired } from "../types/payments";
import { x402Client } from "../client/x402Client";

export class x402HTTPClient extends x402Client {
  encodePaymentSignatureHeader(paymentPayload: PaymentPayload): Record<string, string> {
    switch (paymentPayload.x402Version) {
      case 2:
        return {
          'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(paymentPayload)
        }
      case 1:
        return {
          'X-PAYMENT': encodePaymentSignatureHeader(paymentPayload)
        }
      default:
        throw new Error(`Unsupported x402 version: ${(paymentPayload as PaymentPayload).x402Version}`);
    }
  }

  getPaymentRequiredResponse(headers: Record<string, string>, body?: PaymentRequired): PaymentRequired {
    // v2
    if (headers['PAYMENT-REQUIRED']) {
      return decodePaymentRequiredHeader(headers['PAYMENT-REQUIRED']);
    }

    // v1
    if (body && body.x402Version === 1) {
      return body;
    }

    throw new Error('Invalid payment required response');
  }

  getPaymentSettleResponse(headers: Record<string, string>): SettleResponse {
    // v2
    if (headers['PAYMENT-RESPONSE']) {
      return decodePaymentResponseHeader(headers['PAYMENT-RESPONSE']);
    }

    // v1
    if (headers['X-PAYMENT-RESPONSE']) {
      return decodePaymentResponseHeader(headers['X-PAYMENT-RESPONSE']);
    }

    throw new Error('Payment response header not found');
  }
}