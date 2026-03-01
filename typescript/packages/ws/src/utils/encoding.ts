import { isPaymentPayload, isPaymentRequired } from "@x402/core/schemas";
import type { PaymentRequired, SettleResponse } from "@x402/core/types";
import type {
  WSRequestId,
  WSRequestMessage,
  WSResponseMessage,
  WSError,
  WSPaymentRequiredError,
} from "../types";
import { WS_PAYMENT_REQUIRED_CODE } from "../types";

type TextDecoderLike = {
  decode(input?: ArrayBuffer | ArrayBufferView): string;
};

type GlobalWithUtf8Decoders = {
  TextDecoder?: new () => TextDecoderLike;
  Buffer?: {
    from(data: ArrayBuffer | ArrayBufferView): { toString(encoding: string): string };
  };
};

/**
 * Decodes ArrayBuffer-like values into UTF-8 text.
 *
 * Uses TextDecoder when available, then falls back to Buffer.
 *
 * @param data - Buffer source to decode
 * @returns UTF-8 decoded text
 */
function decodeUtf8(data: ArrayBuffer | ArrayBufferView): string {
  const runtime = globalThis as unknown as GlobalWithUtf8Decoders;

  if (runtime.TextDecoder) {
    const decoder = new runtime.TextDecoder();
    return decoder.decode(data);
  }

  if (runtime.Buffer) {
    return runtime.Buffer.from(data).toString("utf-8");
  }

  throw new Error("No UTF-8 decoder available in this runtime");
}

/**
 * Type guard for non-null object records.
 *
 * @param value - Value to check
 * @returns True when value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Type guard for request IDs.
 *
 * @param value - Value to check
 * @returns True when value is a valid request ID
 */
export function isWSRequestId(value: unknown): value is WSRequestId {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Type guard for WebSocket request envelopes.
 *
 * @param value - Parsed JSON value
 * @returns True when the value is a WSRequestMessage
 */
export function isWSRequestMessage(value: unknown): value is WSRequestMessage {
  if (!isObject(value)) {
    return false;
  }

  if (typeof value.method !== "string") {
    return false;
  }

  if (value.id !== undefined && !isWSRequestId(value.id)) {
    return false;
  }

  if (value.params !== undefined && !isObject(value.params)) {
    return false;
  }

  if (value.metadata !== undefined && !isObject(value.metadata)) {
    return false;
  }

  if (value.payment !== undefined && !isPaymentPayload(value.payment)) {
    return false;
  }

  return true;
}

/**
 * Type guard for standard WS errors.
 *
 * @param value - Parsed JSON value
 * @returns True when value matches WSError shape
 */
export function isWSError(value: unknown): value is WSError {
  if (!isObject(value)) {
    return false;
  }

  return typeof value.code === "number" && typeof value.message === "string";
}

/**
 * Type guard for payment-required WS errors.
 *
 * @param value - Parsed JSON value
 * @returns True when error is an x402 payment-required error
 */
export function isWSPaymentRequiredError(value: unknown): value is WSPaymentRequiredError {
  if (!isWSError(value) || value.code !== WS_PAYMENT_REQUIRED_CODE) {
    return false;
  }

  if (!isObject(value) || !isPaymentRequired(value.paymentRequired)) {
    return false;
  }

  return true;
}

/**
 * Type guard for WebSocket response envelopes.
 *
 * @param value - Parsed JSON value
 * @returns True when value is a WSResponseMessage
 */
export function isWSResponseMessage(value: unknown): value is WSResponseMessage {
  if (!isObject(value)) {
    return false;
  }

  const hasResponsePayloadField =
    "result" in value || "error" in value || "paymentResponse" in value || "metadata" in value;
  if (!hasResponsePayloadField) {
    return false;
  }

  if (value.id !== undefined && !isWSRequestId(value.id)) {
    return false;
  }

  if (value.error !== undefined && !isWSError(value.error)) {
    return false;
  }

  if (value.metadata !== undefined && !isObject(value.metadata)) {
    return false;
  }

  return true;
}

/**
 * Converts incoming WebSocket message data into a UTF-8 string.
 *
 * @param data - Raw message payload from ws event
 * @returns UTF-8 decoded string payload
 */
export function toMessageString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return decodeUtf8(new Uint8Array(data));
  }

  if (ArrayBuffer.isView(data)) {
    return decodeUtf8(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }

  if (Array.isArray(data)) {
    return data.map(chunk => toMessageString(chunk)).join("");
  }

  throw new Error("Unsupported WebSocket message data type");
}

/**
 * Parses WebSocket message payload JSON.
 *
 * @param data - Raw message payload from ws event
 * @returns Parsed JSON value
 */
export function parseWSMessage(data: unknown): unknown {
  const serialized = toMessageString(data);
  return JSON.parse(serialized) as unknown;
}

/**
 * Serializes a response message for socket transmission.
 *
 * @param message - Response envelope
 * @returns Stringified JSON payload
 */
export function stringifyWSMessage(message: WSResponseMessage): string {
  return JSON.stringify(message);
}

/**
 * Attempts to extract PaymentRequired from a response envelope.
 *
 * @param response - Response envelope from server
 * @returns PaymentRequired if response is payment-required, else null
 */
export function extractPaymentRequiredFromResponse(
  response: WSResponseMessage,
): PaymentRequired | null {
  if (!response.error || !isWSPaymentRequiredError(response.error)) {
    return null;
  }

  return response.error.paymentRequired;
}

/**
 * Extracts settlement response payload from a WS response.
 *
 * @param response - Response envelope from server
 * @returns Settlement response when present, otherwise null
 */
export function extractPaymentResponseFromResponse(
  response: WSResponseMessage,
): SettleResponse | null {
  if (!response.paymentResponse || typeof response.paymentResponse !== "object") {
    return null;
  }

  const paymentResponse = response.paymentResponse as Partial<SettleResponse>;
  if (typeof paymentResponse.success !== "boolean") {
    return null;
  }

  return response.paymentResponse;
}

/**
 * Creates a standardized error response envelope.
 *
 * @param id - Request ID to echo back
 * @param code - Error code
 * @param message - Error message
 * @param data - Optional structured error data
 * @returns WS response containing error payload
 */
export function createErrorResponse(
  id: WSRequestId | undefined,
  code: number,
  message: string,
  data?: unknown,
): WSResponseMessage {
  return {
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

/**
 * Creates a standardized payment-required response envelope.
 *
 * @param id - Request ID to echo back
 * @param paymentRequired - PaymentRequired payload
 * @param message - Human-readable message
 * @returns WS response with x402 payment-required error
 */
export function createPaymentRequiredResponse(
  id: WSRequestId | undefined,
  paymentRequired: PaymentRequired,
  message: string,
): WSResponseMessage {
  return {
    id,
    error: {
      code: WS_PAYMENT_REQUIRED_CODE,
      message,
      paymentRequired,
    },
  };
}
