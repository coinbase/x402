import { SettleResponse } from "../types";
import { PaymentPayload, PaymentRequired } from "../types/payments";
import { Base64EncodedRegex, safeBase64Decode, safeBase64Encode } from "../utils";

// HTTP Methods that typically use query parameters
export type QueryParamMethods = "GET" | "HEAD" | "DELETE";

// HTTP Methods that typically use request body
export type BodyMethods = "POST" | "PUT" | "PATCH";

export function encodePaymentSignatureHeader(paymentPayload: PaymentPayload): string {
  return safeBase64Encode(JSON.stringify(paymentPayload));
}

export function decodePaymentSignatureHeader(paymentSignatureHeader: string): PaymentPayload {
  if (!Base64EncodedRegex.test(paymentSignatureHeader)) {
    throw new Error("Invalid payment signature header");
  }
  return JSON.parse(safeBase64Decode(paymentSignatureHeader)) as PaymentPayload;
}

export function encodePaymentRequiredHeader(paymentRequired: PaymentRequired): string {
  return safeBase64Encode(JSON.stringify(paymentRequired));
}

export function decodePaymentRequiredHeader(paymentRequiredHeader: string): PaymentRequired {
  if (!Base64EncodedRegex.test(paymentRequiredHeader)) {
    throw new Error("Invalid payment required header");
  }
  return JSON.parse(safeBase64Decode(paymentRequiredHeader)) as PaymentRequired;
}

export function encodePaymentResponseHeader(paymentResponse: SettleResponse): string {
  return safeBase64Encode(JSON.stringify(paymentResponse));
}

export function decodePaymentResponseHeader(paymentResponseHeader: string): SettleResponse {
  if (!Base64EncodedRegex.test(paymentResponseHeader)) {
    throw new Error("Invalid payment response header");
  }
  return JSON.parse(safeBase64Decode(paymentResponseHeader)) as SettleResponse;
}

// Export HTTP service and types
export {
  x402HTTPResourceService,
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
  HTTPProcessResult,
  PaywallConfig,
  RouteConfig,
  RoutesConfig,
  CompiledRoute
} from './x402HTTPResourceService';
export { HTTPFacilitatorClient } from './httpFacilitatorClient';
export { x402HTTPClient } from './x402HTTPClient';