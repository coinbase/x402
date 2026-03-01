// @x402/ws - WebSocket transport integration for x402 payment protocol

// Client exports
export {
  x402WSClient,
  createx402WSClient,
  wrapWSClientWithPayment,
  wrapWSClientWithPaymentFromConfig,
} from "./client";

// Server exports
export { createWSPaymentWrapper, x402WSServer } from "./server";

// Type exports
export {
  WS_INTERNAL_ERROR_CODE,
  WS_INVALID_REQUEST_CODE,
  WS_METHOD_NOT_FOUND_CODE,
  WS_PAYMENT_REQUIRED_CODE,
} from "./types";
export type {
  WSError,
  WSPaymentRequiredError,
  WSRequestId,
  WSRequestMessage,
  WSResponseMessage,
  WSRouteHandler,
  WSHandlerContext,
  WSPaymentWrapperConfig,
  WSWrappedHandler,
  WSServerHookContext,
  WSAfterExecutionContext,
  WSSettlementContext,
  WSBeforeExecutionHook,
  WSAfterExecutionHook,
  WSAfterSettlementHook,
  WSPaymentRequestedContext,
  WSPaymentRequiredHook,
  WSPaymentRequiredHookResult,
  WSBeforePaymentHook,
  WSAfterPaymentHook,
  x402WSClientOptions,
  x402WSClientConfig,
  x402WSCallResult,
  WSRequestOptions,
  WSClientSocket,
} from "./types";

// Utility exports
export {
  createErrorResponse,
  createPaymentRequiredResponse,
  extractPaymentRequiredFromResponse,
  extractPaymentResponseFromResponse,
  isObject,
  isWSError,
  isWSPaymentRequiredError,
  isWSRequestId,
  isWSRequestMessage,
  isWSResponseMessage,
  parseWSMessage,
  stringifyWSMessage,
  toMessageString,
} from "./utils";

// Convenience re-exports from @x402/core
export { x402Client } from "@x402/core/client";
export type {
  x402ClientConfig,
  PaymentPolicy,
  SchemeRegistration,
  SelectPaymentRequirements,
} from "@x402/core/client";

export { x402ResourceServer } from "@x402/core/server";

export type {
  Network,
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SchemeNetworkClient,
  SchemeNetworkServer,
  SettleResponse,
} from "@x402/core/types";
