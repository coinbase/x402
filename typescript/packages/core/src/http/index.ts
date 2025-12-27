import { SettleResponse } from "../types";
import { PaymentPayload, PaymentRequired, PaymentRequirements } from "../types/payments";
import { Base64EncodedRegex, safeBase64Decode, safeBase64Encode } from "../utils";

// HTTP Methods that typically use query parameters
export type QueryParamMethods = "GET" | "HEAD" | "DELETE";

// HTTP Methods that typically use request body
export type BodyMethods = "POST" | "PUT" | "PATCH";

/**
 * Encodes a payment payload as a base64 header value.
 *
 * @param paymentPayload - The payment payload to encode
 * @returns Base64 encoded string representation of the payment payload
 */
export function encodePaymentSignatureHeader(paymentPayload: PaymentPayload): string {
  return safeBase64Encode(JSON.stringify(paymentPayload));
}

/**
 * Decodes a base64 payment signature header into a payment payload.
 * Validates all required fields and their structure.
 *
 * @param paymentSignatureHeader - The base64 encoded payment signature header
 * @returns The decoded payment payload
 * @throws Error with descriptive message if validation fails
 */
export function decodePaymentSignatureHeader(paymentSignatureHeader: string): PaymentPayload {
  // Validate base64 format
  if (!paymentSignatureHeader || paymentSignatureHeader.trim() === "") {
    throw new Error("Payment header is empty");
  }

  if (!Base64EncodedRegex.test(paymentSignatureHeader)) {
    throw new Error("Invalid payment header format: not valid base64");
  }

  // Decode and parse JSON
  let decoded: string;
  try {
    decoded = safeBase64Decode(paymentSignatureHeader);
  } catch (error) {
    throw new Error("Invalid payment header format: base64 decoding failed");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    throw new Error("Invalid payment header format: not valid JSON");
  }

  // Validate it's an object
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid payment header format: must be a JSON object");
  }

  const payload = parsed as Record<string, unknown>;

  // Validate required top-level fields
  if (!("x402Version" in payload)) {
    throw new Error("Missing required field: x402Version");
  }
  if (typeof payload.x402Version !== "number") {
    throw new Error("Invalid field type: x402Version must be a number");
  }

  if (!("resource" in payload)) {
    throw new Error("Missing required field: resource");
  }
  if (typeof payload.resource !== "object" || payload.resource === null || Array.isArray(payload.resource)) {
    throw new Error("Invalid field type: resource must be an object");
  }

  // Validate resource fields
  const resource = payload.resource as Record<string, unknown>;
  if (!("url" in resource)) {
    throw new Error("Missing required field: resource.url");
  }
  if (typeof resource.url !== "string") {
    throw new Error("Invalid field type: resource.url must be a string");
  }
  if (!("description" in resource)) {
    throw new Error("Missing required field: resource.description");
  }
  if (typeof resource.description !== "string") {
    throw new Error("Invalid field type: resource.description must be a string");
  }
  if (!("mimeType" in resource)) {
    throw new Error("Missing required field: resource.mimeType");
  }
  if (typeof resource.mimeType !== "string") {
    throw new Error("Invalid field type: resource.mimeType must be a string");
  }

  if (!("accepted" in payload)) {
    throw new Error("Missing required field: accepted");
  }
  if (typeof payload.accepted !== "object" || payload.accepted === null || Array.isArray(payload.accepted)) {
    throw new Error("Invalid field type: accepted must be an object");
  }

  if (!("payload" in payload)) {
    throw new Error("Missing required field: payload");
  }
  if (typeof payload.payload !== "object" || payload.payload === null || Array.isArray(payload.payload)) {
    throw new Error("Invalid field type: payload must be an object");
  }

  return parsed as PaymentPayload;
}

/**
 * Encodes a payment required object as a base64 header value.
 *
 * @param paymentRequired - The payment required object to encode
 * @returns Base64 encoded string representation of the payment required object
 */
export function encodePaymentRequiredHeader(paymentRequired: PaymentRequired): string {
  return safeBase64Encode(JSON.stringify(paymentRequired));
}

/**
 * Decodes a base64 payment required header into a payment required object.
 *
 * @param paymentRequiredHeader - The base64 encoded payment required header
 * @returns The decoded payment required object
 */
export function decodePaymentRequiredHeader(paymentRequiredHeader: string): PaymentRequired {
  if (!Base64EncodedRegex.test(paymentRequiredHeader)) {
    throw new Error("Invalid payment required header");
  }
  return JSON.parse(safeBase64Decode(paymentRequiredHeader)) as PaymentRequired;
}

/**
 * Encodes a payment response as a base64 header value.
 *
 * @param paymentResponse - The payment response to encode
 * @returns Base64 encoded string representation of the payment response
 */
export function encodePaymentResponseHeader(
  paymentResponse: SettleResponse & { requirements: PaymentRequirements },
): string {
  return safeBase64Encode(JSON.stringify(paymentResponse));
}

/**
 * Decodes a base64 payment response header into a settle response.
 *
 * @param paymentResponseHeader - The base64 encoded payment response header
 * @returns The decoded settle response
 */
export function decodePaymentResponseHeader(paymentResponseHeader: string): SettleResponse {
  if (!Base64EncodedRegex.test(paymentResponseHeader)) {
    throw new Error("Invalid payment response header");
  }
  return JSON.parse(safeBase64Decode(paymentResponseHeader)) as SettleResponse;
}

// Export HTTP service and types
export {
  x402HTTPResourceServer,
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
  HTTPProcessResult,
  PaywallConfig,
  PaywallProvider,
  PaymentOption,
  RouteConfig,
  RoutesConfig,
  CompiledRoute,
  DynamicPayTo,
  DynamicPrice,
  UnpaidResponseBody,
  UnpaidResponseResult,
  ProcessSettleResultResponse,
  ProcessSettleSuccessResponse,
  ProcessSettleFailureResponse,
  RouteValidationError,
  RouteConfigurationError,
} from "./x402HTTPResourceServer";
export {
  HTTPFacilitatorClient,
  FacilitatorClient,
  FacilitatorConfig,
} from "./httpFacilitatorClient";
export { x402HTTPClient } from "./x402HTTPClient";
