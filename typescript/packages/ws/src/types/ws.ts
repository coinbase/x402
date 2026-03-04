import type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SchemeNetworkClient,
  SettleResponse,
} from "@x402/core/types";
import type WebSocket from "ws";
import type { WebSocketServer } from "ws";

/** WebSocket error code for payment required responses. */
export const WS_PAYMENT_REQUIRED_CODE = 402;

/** WebSocket error code for malformed client requests. */
export const WS_INVALID_REQUEST_CODE = 400;

/** WebSocket error code for unknown methods. */
export const WS_METHOD_NOT_FOUND_CODE = 404;

/** WebSocket error code for internal server errors. */
export const WS_INTERNAL_ERROR_CODE = 500;

/** Request identifier type used for request-response correlation. */
export type WSRequestId = string | number;

/**
 * WebSocket request envelope for x402 RPC-style interactions.
 */
export interface WSRequestMessage {
  /** Correlation ID for matching responses to requests. */
  id?: WSRequestId;
  /** The method to invoke on the server. */
  method: string;
  /** Parameters for the method invocation. */
  params?: Record<string, unknown>;
  /** Optional x402 payment payload sent by the client. */
  payment?: PaymentPayload;
  /** Optional application metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Standard error shape used in WS responses.
 */
export interface WSError {
  /** Numeric error code. */
  code: number;
  /** Human-readable error message. */
  message: string;
  /** Optional structured data attached to the error. */
  data?: unknown;
}

/**
 * Error payload for x402 payment-required responses over WebSockets.
 */
export interface WSPaymentRequiredError extends WSError {
  /** Must be 402 for payment required errors. */
  code: typeof WS_PAYMENT_REQUIRED_CODE;
  /** PaymentRequired payload describing accepted payment options. */
  paymentRequired: PaymentRequired;
}

/**
 * WebSocket response envelope for x402 RPC-style interactions.
 */
export interface WSResponseMessage {
  /** Correlation ID copied from the request. */
  id?: WSRequestId;
  /** Successful result payload. */
  result?: unknown;
  /** Error payload if request processing failed. */
  error?: WSError | WSPaymentRequiredError;
  /** Settlement response when payment is settled successfully. */
  paymentResponse?: SettleResponse;
  /** Optional application metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Handler context provided to WebSocket route handlers.
 */
export interface WSHandlerContext {
  /** The socket that sent the request. */
  socket: WebSocket;
  /** The underlying ws WebSocketServer instance. */
  server: WebSocketServer;
  /** The decoded incoming request envelope. */
  request: WSRequestMessage;
}

/**
 * Route handler type for x402WSServer.
 */
export type WSRouteHandler = (
  request: WSRequestMessage,
  context: WSHandlerContext,
) => Promise<WSResponseMessage | unknown> | WSResponseMessage | unknown;

/**
 * Hook context for server-side payment lifecycle callbacks.
 */
export interface WSServerHookContext {
  /** Correlation ID for the active request. */
  requestId?: WSRequestId;
  /** RPC method being executed. */
  method: string;
  /** Method parameters. */
  params: Record<string, unknown>;
  /** Matched payment requirements. */
  paymentRequirements: PaymentRequirements;
  /** Payment payload sent by the client. */
  paymentPayload: PaymentPayload;
  /** Client socket executing the request. */
  socket: WebSocket;
}

/**
 * Context passed to after-execution hooks.
 */
export interface WSAfterExecutionContext extends WSServerHookContext {
  /** Handler result returned before settlement. */
  result: unknown;
}

/**
 * Context passed to after-settlement hooks.
 */
export interface WSSettlementContext extends WSServerHookContext {
  /** Settlement response returned by x402ResourceServer. */
  settlement: SettleResponse;
}

/**
 * Hook invoked before business handler execution.
 * Returning false aborts execution and returns a payment-required error.
 */
export type WSBeforeExecutionHook = (
  context: WSServerHookContext,
) => Promise<boolean | void> | boolean | void;

/** Hook invoked after business handler execution and before settlement. */
export type WSAfterExecutionHook = (context: WSAfterExecutionContext) => Promise<void> | void;

/** Hook invoked after successful settlement. */
export type WSAfterSettlementHook = (context: WSSettlementContext) => Promise<void> | void;

/**
 * Configuration for server-side payment wrapper.
 */
export interface WSPaymentWrapperConfig {
  /** Supported payment requirements for a handler. */
  accepts: PaymentRequirements[];
  /** Optional resource metadata used when creating PaymentRequired responses. */
  resource?: {
    /** Optional custom resource URL. */
    url?: string;
    /** Optional human-readable description. */
    description?: string;
    /** Optional MIME type for handler responses. */
    mimeType?: string;
  };
  /** Optional server-side lifecycle hooks. */
  hooks?: {
    /** Called before execution after verification. */
    onBeforeExecution?: WSBeforeExecutionHook;
    /** Called after execution before settlement. */
    onAfterExecution?: WSAfterExecutionHook;
    /** Called after successful settlement. */
    onAfterSettlement?: WSAfterSettlementHook;
  };
}

/**
 * Business handler signature used by createWSPaymentWrapper.
 */
export type WSWrappedHandler<TParams = Record<string, unknown>> = (
  params: TParams,
  context: WSHandlerContext,
) => Promise<unknown> | unknown;

/**
 * Context provided when payment is requested by a server response.
 */
export interface WSPaymentRequestedContext {
  /** RPC method being called. */
  method: string;
  /** Method parameters used in the request. */
  params: Record<string, unknown>;
  /** Payment requirements returned by the server. */
  paymentRequired: PaymentRequired;
}

/**
 * Result from onPaymentRequired hooks.
 */
export interface WSPaymentRequiredHookResult {
  /** Optional custom payment payload to use instead of auto-generation. */
  payment?: PaymentPayload;
  /** Abort automatic payment flow. */
  abort?: boolean;
}

/**
 * Hook called when a payment-required response is received.
 */
export type WSPaymentRequiredHook = (
  context: WSPaymentRequestedContext,
) => Promise<WSPaymentRequiredHookResult | void> | WSPaymentRequiredHookResult | void;

/** Hook called before creating/submitting payment payload. */
export type WSBeforePaymentHook = (context: WSPaymentRequestedContext) => Promise<void> | void;

/**
 * Hook called after submitting payment and receiving response.
 */
export type WSAfterPaymentHook = (context: {
  /** RPC method being called. */
  method: string;
  /** Method parameters used in the request. */
  params: Record<string, unknown>;
  /** Submitted payment payload. */
  paymentPayload: PaymentPayload;
  /** Raw response envelope returned by the server. */
  response: WSResponseMessage;
  /** Settlement response if available. */
  settleResponse: SettleResponse | null;
}) => Promise<void> | void;

/**
 * Client options for x402WSClient.
 */
export interface x402WSClientOptions {
  /** Whether client should auto-generate and retry with payment on 402 responses. */
  autoPayment?: boolean;
  /** Optional approval callback called before auto-payment. */
  onPaymentRequested?: (context: WSPaymentRequestedContext) => Promise<boolean> | boolean;
}

/**
 * Optional per-request options for x402WSClient calls.
 */
export interface WSRequestOptions {
  /** Timeout in milliseconds for awaiting a response. */
  timeoutMs?: number;
}

/**
 * Return type from x402WSClient.call and callWithPayment.
 */
export interface x402WSCallResult<TResult = unknown> {
  /** Parsed method result from server response. */
  result: TResult;
  /** Whether this call submitted a payment payload. */
  paymentMade: boolean;
  /** Settlement response when available. */
  paymentResponse?: SettleResponse;
}

/**
 * Configuration for createx402WSClient factory.
 */
export interface x402WSClientConfig {
  /** Payment scheme registrations used by the internal x402Client. */
  schemes: Array<{
    /** CAIP-2 network identifier. */
    network: Network;
    /** Scheme client implementation for the network. */
    client: SchemeNetworkClient;
    /** x402 version override (defaults to v2). */
    x402Version?: number;
  }>;
  /** Whether to auto-pay when receiving payment-required errors. */
  autoPayment?: boolean;
  /** Optional user-approval callback before submitting payment. */
  onPaymentRequested?: (context: WSPaymentRequestedContext) => Promise<boolean> | boolean;
}

/**
 * Minimal socket interface required by x402WSClient.
 */
export interface WSClientSocket {
  /** Current WebSocket readyState value. */
  readyState: number;
  /** Sends a string payload over the socket. */
  send(data: string): void;
  /** Registers a message listener. */
  on(event: "message", listener: (data: unknown) => void): this;
  /** Registers a close listener. */
  on(event: "close", listener: (code: number, reason: unknown) => void): this;
  /** Registers an error listener. */
  on(event: "error", listener: (error: Error) => void): this;
  /** Registers a one-time open listener. */
  once(event: "open", listener: () => void): this;
  /** Removes a listener. */
  off(event: "open", listener: () => void): this;
  /** Removes a listener. */
  off(event: "error", listener: (error: Error) => void): this;
}
