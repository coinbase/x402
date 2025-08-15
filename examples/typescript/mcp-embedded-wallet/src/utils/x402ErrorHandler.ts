import { AxiosError } from "axios";
import { operationStore } from "../stores/operations";
import { type x402Response } from "x402/types";

export interface ErrorHandlingContext {
  correlationId: string;
  fullUrl: string;
  method: string;
  baseURL: string;
  path: string;
  queryParams?: Record<string, string>;
  body?: unknown;
}

/**
 * Handles 402 Payment Required errors with server response parsing.
 * Checks if payment was already attempted and updates operations accordingly.
 *
 * @param error - The error object from the failed request
 * @param context - The context object containing request details
 * @throws {Error} Re-throws the original error for the payment interceptor to handle
 */
export function handle402Error(error: unknown, context: ErrorHandlingContext): void {
  console.log(
    `402 Payment Required for ${context.fullUrl} (correlationId: ${context.correlationId})`,
  );

  // Check if payment was already attempted but rejected by server
  const currentOperations = operationStore.getState().operations;
  const hasSuccessfulPayment = currentOperations.some(
    op =>
      op.correlationId === context.correlationId &&
      op.type === "wallet" &&
      op.status === "success" &&
      op.description.includes("Payment authorization completed"),
  );

  if (hasSuccessfulPayment) {
    handlePaymentRejection(error, context.correlationId);
  } else {
    console.log(
      `Initial 402 for correlation ${context.correlationId} - payment interceptor will attempt payment`,
    );
  }

  // Always let payment interceptor handle 402s
  throw error;
}

/**
 * Handles payment rejection after successful signing.
 * Parses server error messages and updates operations with specific error details.
 *
 * @param error - The error object containing server response data
 * @param correlationId - ID to correlate this operation with others
 * @returns {void} No return value
 */
function handlePaymentRejection(error: unknown, correlationId: string): void {
  console.log(`Payment was signed but rejected by server for correlation ${correlationId}`);

  // Parse server's specific error message
  let serverError = "Unknown server error";
  let description = "Payment rejected by server";

  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as AxiosError<x402Response>;
    const responseData = axiosError.response?.data as x402Response;

    console.log(`Server response data:`, JSON.stringify(responseData, null, 2));

    if (responseData?.error) {
      const serverErrorCode = responseData.error;
      console.log(`Server rejection reason: ${serverErrorCode}`);

      switch (serverErrorCode) {
        case "insufficient_funds":
          const accepts = responseData.accepts?.[0];
          const amount = accepts?.maxAmountRequired || "unknown amount";
          const asset = accepts?.extra?.name || accepts?.asset || "tokens";
          serverError = `Insufficient ${asset} in wallet (${amount} required)`;
          description = `Payment failed - insufficient ${asset} balance`;
          break;
        case "invalid_payment":
          serverError = "Invalid payment signature";
          description = "Payment failed - invalid payment signature";
          break;
        case "payment_expired":
          serverError = "Payment authorization expired";
          description = "Payment failed - payment authorization expired";
          break;
        default:
          serverError = `Server error: ${serverErrorCode}`;
          description = `Payment failed - ${serverErrorCode}`;
      }
    }
  }

  // Update pending wallet operation to show rejection
  const currentOperations = operationStore.getState().operations;
  const pendingWalletOpIndex = currentOperations.findIndex(
    op => op.correlationId === correlationId && op.status === "pending" && op.type === "wallet",
  );

  if (pendingWalletOpIndex !== -1) {
    operationStore.getState().updateWalletOperation(pendingWalletOpIndex, {
      description,
      status: "error",
      errorMessage: serverError,
    });
  }
}

/**
 * Handles non-402 errors such as wallet errors, insufficient balance, etc.
 * Categorizes errors, updates operations, and logs error details.
 *
 * @param error - The error object from the failed request
 * @param context - The context object containing request details
 * @throws {Error} Throws a wrapped error with additional context
 */
export function handleNon402Error(error: unknown, context: ErrorHandlingContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.log(
    `Non-402 error for ${context.fullUrl} (correlationId: ${context.correlationId}): ${errorMessage}`,
  );

  // Check for wallet-related errors
  const walletErrorType = categorizeWalletError(errorMessage);

  if (walletErrorType) {
    updateWalletOperationForError(context.correlationId, walletErrorType, errorMessage);
  }

  // Update HTTP operation to show failure
  updateHttpOperationForError(context, errorMessage);

  // Log error details for debugging
  logErrorDetails(error, context);

  throw new Error(`X402 request failed: ${errorMessage}`);
}

/**
 * Categorizes wallet errors for better error messages.
 * Analyzes error message content to determine specific error types.
 *
 * @param errorMessage - The error message to analyze
 * @returns {string | null} The categorized error type or null if unrecognized
 */
function categorizeWalletError(errorMessage: string): string | null {
  const lowerError = errorMessage.toLowerCase();

  if (
    lowerError.includes("insufficient") &&
    (lowerError.includes("balance") || lowerError.includes("funds"))
  ) {
    return "insufficient_balance";
  }

  if (
    (lowerError.includes("insufficient") &&
      (lowerError.includes("gas") || lowerError.includes("eth"))) ||
    lowerError.includes("out of gas") ||
    lowerError.includes("gas limit") ||
    lowerError.includes("intrinsic gas")
  ) {
    return "insufficient_gas";
  }

  if (lowerError.includes("user rejected") || lowerError.includes("user denied")) {
    return "user_rejected";
  }

  if (
    lowerError.includes("payment failed") ||
    lowerError.includes("signature") ||
    lowerError.includes("unauthorized")
  ) {
    return "general_wallet_error";
  }

  return null;
}

/**
 * Updates wallet operation based on error type.
 * Sets appropriate error descriptions based on the error category.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param errorType - The categorized type of error (e.g., 'insufficient_balance')
 * @param errorMessage - The detailed error message
 * @returns {void} No return value
 */
function updateWalletOperationForError(
  correlationId: string,
  errorType: string,
  errorMessage: string,
): void {
  const currentOperations = operationStore.getState().operations;
  const pendingWalletOpIndex = currentOperations.findIndex(
    op => op.correlationId === correlationId && op.status === "pending" && op.type === "wallet",
  );

  if (pendingWalletOpIndex !== -1) {
    let description = "Payment failed";

    switch (errorType) {
      case "insufficient_balance":
        description = "Payment failed - insufficient wallet balance";
        break;
      case "insufficient_gas":
        description = "Payment failed - insufficient ETH for gas fees";
        break;
      case "user_rejected":
        description = "Payment cancelled by user";
        break;
      default:
        description = "Payment failed";
    }

    operationStore.getState().updateWalletOperation(pendingWalletOpIndex, {
      description,
      status: "error",
      errorMessage: errorMessage,
    });
  }
}

/**
 * Updates HTTP operation to show failure.
 * Updates existing operation or creates a new error operation if none exists.
 *
 * @param context - The context object containing request details
 * @param errorMessage - The error message to display
 * @returns {void} No return value
 */
function updateHttpOperationForError(context: ErrorHandlingContext, errorMessage: string): void {
  const currentOperations = operationStore.getState().operations;
  const pendingOpIndex = [...currentOperations]
    .reverse()
    .findIndex(
      op =>
        op.correlationId === context.correlationId && op.status === "pending" && op.type === "http",
    );

  if (pendingOpIndex !== -1) {
    const actualIndex = currentOperations.length - 1 - pendingOpIndex;
    operationStore.getState().updateHttpOperation(actualIndex, {
      description: `Failed ${context.method} request to ${context.path}`,
      status: "error",
      errorMessage: errorMessage,
    });
  } else {
    // Fallback: add new error operation
    operationStore
      .getState()
      .addHttpOperation(
        `Failed ${context.method} request to ${context.path}`,
        "error",
        context.method,
        context.fullUrl,
        errorMessage,
        context.correlationId,
      );
  }
}

/**
 * Logs error details for debugging purposes.
 * Formats and logs both error and context information.
 *
 * @param error - The error object to log
 * @param context - The context object containing request details
 * @returns {void} No return value
 */
function logErrorDetails(error: unknown, context: ErrorHandlingContext): void {
  console.info("Request error:", error);

  const errorDetails = {
    baseURL: context.baseURL,
    path: context.path,
    method: context.method,
    queryParams: context.queryParams,
    body: context.body,
    correlationId: context.correlationId,
    error: JSON.stringify(error, null, 2),
  };

  console.error("X402 request error details:", JSON.stringify(errorDetails, null, 2));
}
