import { x402ResourceServer } from "@x402/core/server";

import type {
  WSHandlerContext,
  WSRequestId,
  WSRequestMessage,
  WSResponseMessage,
  WSPaymentWrapperConfig,
  WSWrappedHandler,
  WSServerHookContext,
  WSAfterExecutionContext,
  WSSettlementContext,
} from "../types";
import { isWSResponseMessage } from "../utils";
import { createPaymentRequiredResponse as createWSPaymentRequiredResponse } from "../utils";

/**
 * Creates a reusable payment wrapper for WebSocket method handlers.
 *
 * @param resourceServer - The core resource server used for verify/settle operations
 * @param config - Wrapper configuration including accepted payment requirements
 * @returns Function that wraps a business handler with x402 payment flow
 */
export function createWSPaymentWrapper(
  resourceServer: x402ResourceServer,
  config: WSPaymentWrapperConfig,
): <TParams extends Record<string, unknown>>(
  handler: WSWrappedHandler<TParams>,
) => (request: WSRequestMessage, context: WSHandlerContext) => Promise<WSResponseMessage> {
  if (!config.accepts || config.accepts.length === 0) {
    throw new Error("WSPaymentWrapperConfig.accepts must have at least one payment requirement");
  }

  return <TParams extends Record<string, unknown>>(
    handler: WSWrappedHandler<TParams>,
  ): ((request: WSRequestMessage, context: WSHandlerContext) => Promise<WSResponseMessage>) => {
    return async (
      request: WSRequestMessage,
      context: WSHandlerContext,
    ): Promise<WSResponseMessage> => {
      const params = (request.params || {}) as TParams;
      const paymentPayload = request.payment || null;

      if (!paymentPayload) {
        return createPaymentRequiredResult(
          resourceServer,
          request.id,
          request.method,
          config,
          "Payment required to access this method",
        );
      }

      const paymentRequirements = resourceServer.findMatchingRequirements(
        config.accepts,
        paymentPayload,
      );
      if (!paymentRequirements) {
        return createPaymentRequiredResult(
          resourceServer,
          request.id,
          request.method,
          config,
          "No matching payment requirements found",
        );
      }

      let verifyResult;
      try {
        verifyResult = await resourceServer.verifyPayment(paymentPayload, paymentRequirements);
      } catch (error) {
        return createPaymentRequiredResult(
          resourceServer,
          request.id,
          request.method,
          config,
          error instanceof Error ? error.message : "Payment verification failed",
        );
      }

      if (!verifyResult.isValid) {
        return createPaymentRequiredResult(
          resourceServer,
          request.id,
          request.method,
          config,
          verifyResult.invalidReason || "Payment verification failed",
        );
      }

      const hookContext: WSServerHookContext = {
        requestId: request.id,
        method: request.method,
        params,
        paymentPayload,
        paymentRequirements,
        socket: context.socket,
      };

      if (config.hooks?.onBeforeExecution) {
        const beforeExecutionResult = await config.hooks.onBeforeExecution(hookContext);
        if (beforeExecutionResult === false) {
          return createPaymentRequiredResult(
            resourceServer,
            request.id,
            request.method,
            config,
            "Execution blocked by hook",
          );
        }
      }

      const handlerResult = await handler(params, context);
      if (isWSResponseMessage(handlerResult) && handlerResult.error) {
        return withResponseId(request.id, handlerResult);
      }

      if (config.hooks?.onAfterExecution) {
        const afterExecutionContext: WSAfterExecutionContext = {
          ...hookContext,
          result: handlerResult,
        };
        await config.hooks.onAfterExecution(afterExecutionContext);
      }

      let settleResult;
      try {
        settleResult = await resourceServer.settlePayment(paymentPayload, paymentRequirements);
      } catch (error) {
        return createSettlementFailedResult(
          resourceServer,
          request.id,
          request.method,
          config,
          error instanceof Error ? error.message : "Settlement failed",
        );
      }

      if (!settleResult.success) {
        const settleFailure = settleResult as {
          errorMessage?: string;
          errorReason?: string;
        };
        return createSettlementFailedResult(
          resourceServer,
          request.id,
          request.method,
          config,
          settleFailure.errorMessage || settleFailure.errorReason || "Settlement failed",
        );
      }

      if (config.hooks?.onAfterSettlement) {
        const settlementContext: WSSettlementContext = {
          ...hookContext,
          settlement: settleResult,
        };
        await config.hooks.onAfterSettlement(settlementContext);
      }

      const response = isWSResponseMessage(handlerResult)
        ? withResponseId(request.id, handlerResult)
        : { id: request.id, result: handlerResult };

      return {
        ...response,
        paymentResponse: settleResult,
      };
    };
  };
}

/**
 * Creates a payment-required response for a wrapped WebSocket method.
 *
 * @param resourceServer - The x402 resource server instance
 * @param requestId - Request identifier used for correlation
 * @param method - Method name used to build default resource metadata
 * @param config - Wrapper configuration
 * @param errorMessage - Human-readable error message
 * @returns Payment-required WS response envelope
 */
async function createPaymentRequiredResult(
  resourceServer: x402ResourceServer,
  requestId: WSRequestId | undefined,
  method: string,
  config: WSPaymentWrapperConfig,
  errorMessage: string,
): Promise<WSResponseMessage> {
  const paymentRequired = await resourceServer.createPaymentRequiredResponse(
    config.accepts,
    createResourceInfo(method, config),
    errorMessage,
  );

  return createWSPaymentRequiredResponse(requestId, paymentRequired, errorMessage);
}

/**
 * Creates a settlement-failed response for a wrapped WebSocket method.
 *
 * @param resourceServer - The x402 resource server instance
 * @param requestId - Request identifier used for correlation
 * @param method - Method name used to build default resource metadata
 * @param config - Wrapper configuration
 * @param errorMessage - Human-readable settlement failure message
 * @returns Payment-required WS response envelope
 */
async function createSettlementFailedResult(
  resourceServer: x402ResourceServer,
  requestId: WSRequestId | undefined,
  method: string,
  config: WSPaymentWrapperConfig,
  errorMessage: string,
): Promise<WSResponseMessage> {
  return createPaymentRequiredResult(
    resourceServer,
    requestId,
    method,
    config,
    `Payment settlement failed: ${errorMessage}`,
  );
}

/**
 * Creates default resource metadata for payment-required responses.
 *
 * @param method - WebSocket method name
 * @param config - Wrapper configuration
 * @returns ResourceInfo-compatible object
 */
function createResourceInfo(
  method: string,
  config: WSPaymentWrapperConfig,
): {
  url: string;
  description: string;
  mimeType: string;
} {
  return {
    url: config.resource?.url || `ws://method/${method}`,
    description: config.resource?.description || `Method: ${method}`,
    mimeType: config.resource?.mimeType || "application/json",
  };
}

/**
 * Ensures response envelopes contain a correlation ID.
 *
 * @param requestId - Request identifier from incoming request
 * @param response - Handler-generated response
 * @returns Response with correlation ID set
 */
function withResponseId(
  requestId: WSRequestId | undefined,
  response: WSResponseMessage,
): WSResponseMessage {
  if (response.id !== undefined) {
    return response;
  }

  return {
    ...response,
    id: requestId,
  };
}
