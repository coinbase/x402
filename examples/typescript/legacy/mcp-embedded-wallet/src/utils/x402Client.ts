import axios from "axios";
import { base, baseSepolia } from "viem/chains";
import { withPaymentInterceptor } from "x402-axios";
import { PaymentRequirements } from "x402/types";
import { budgetStore } from "../stores/budget";
import { operationStore, SettlementInfo } from "../stores/operations";
import { getBlockExplorerUrl, formatUSDC } from "./chainConfig";
import { createPaymentTrackingInterceptor, PaymentInterceptorError } from "./paymentInterceptor";
import { handle402Error, handleNon402Error, type ErrorHandlingContext } from "./x402ErrorHandler";
import { getCurrentUser, toViemAccount } from "@coinbase/cdp-core";

// Helper types for the MCP tool
export type X402RequestParams = {
  baseURL: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  queryParams?: Record<string, string>;
  body?: unknown;
  correlationId?: string;
  maxAmountPerRequest?: number;
  paymentRequirements?: PaymentRequirements[]; // Can be provided via discovery or directly
};

/**
 * Makes an HTTP request with x402 payment handling capabilities.
 * Handles payment requirements, tracks operations, and manages payment flow.
 *
 * @param root0 - The request configuration object
 * @param root0.baseURL - The base URL for the request
 * @param root0.path - The path to append to the base URL
 * @param root0.method - The HTTP method to use
 * @param root0.queryParams - Optional query parameters to include in the URL
 * @param root0.body - Optional request body data
 * @param root0.correlationId - Optional ID to correlate operations (auto-generated if not provided)
 * @param root0.maxAmountPerRequest - Optional max amount per request
 * @param root0.paymentRequirements - Optional pre-discovered payment requirements
 * @returns {Promise<{status: number; statusText: string; data: unknown; headers: Record<string, string>}>} The response data
 * @throws {PaymentInterceptorError} If payment requirements cannot be met
 * @throws {Error} If the request fails for any other reason
 */
export async function makeX402Request({
  baseURL,
  path,
  method,
  queryParams,
  body,
  correlationId,
  maxAmountPerRequest,
  paymentRequirements,
}: X402RequestParams) {
  const user = await getCurrentUser();
  if (!user || !user.evmAccounts || user.evmAccounts.length === 0) {
    throw new Error("No CDP user or EVM accounts found");
  }

  const evmAccount = user.evmAccounts[0];
  const account = await toViemAccount(evmAccount);

  const chain = import.meta.env.VITE_TESTNET ? baseSepolia : base;

  // Generate correlation ID if not provided
  const finalCorrelationId =
    correlationId || `x402-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Resolve max per-request budget: use explicit param if provided, otherwise pull from store (atomic)
  const storePerRequestMaxAtomic = budgetStore.getState().perRequestMaxAtomic;
  const effectiveMaxAmountPerRequest =
    typeof maxAmountPerRequest === "number"
      ? maxAmountPerRequest
      : storePerRequestMaxAtomic
        ? Number(storePerRequestMaxAtomic)
        : undefined;

  // Create axios instance with payment tracking interceptors
  const axiosInstance = axios.create({ baseURL });
  const trackedInstance = createPaymentTrackingInterceptor(
    axiosInstance,
    finalCorrelationId,
    account.address,
    chain,
    effectiveMaxAmountPerRequest,
    paymentRequirements, // Pass pre-discovered payment requirements
  );
  // Cast to any to work around axios version mismatch between dependencies
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchWithPayment = withPaymentInterceptor(trackedInstance as any, account as any);

  try {
    // Add initial operation (interceptor will handle payment logic)
    if (paymentRequirements && paymentRequirements.length > 0) {
      console.log(
        `Making ${method} request to ${baseURL}${path} with pre-discovered payment requirements`,
      );

      operationStore
        .getState()
        .addHttpOperation(
          `Making ${method} request to ${baseURL}${path} (payment required)`,
          "pending",
          method,
          `${baseURL}${path}`,
          undefined,
          finalCorrelationId,
          maxAmountPerRequest,
          paymentRequirements,
          paymentRequirements[0],
          undefined,
        );
    } else {
      console.log(`Making ${method} request to ${baseURL}${path}`);

      operationStore
        .getState()
        .addHttpOperation(
          `Making ${method} request to ${baseURL}${path}`,
          "pending",
          method,
          `${baseURL}${path}`,
          undefined,
          finalCorrelationId,
        );
    }

    // Make the request (interceptor and x402 library will handle payment flow)
    const response = await fetchWithPayment(path, {
      method,
      params: queryParams,
      data: body,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Extract settlement info from X-PAYMENT-RESPONSE header
    let settlementInfo: SettlementInfo | undefined;
    const paymentResponseHeader =
      response.headers["x-payment-response"] || response.headers["X-PAYMENT-RESPONSE"];
    if (paymentResponseHeader) {
      try {
        settlementInfo = JSON.parse(atob(paymentResponseHeader));
        console.log(`Settlement info captured:`, settlementInfo);
      } catch (error) {
        console.warn("Failed to parse X-PAYMENT-RESPONSE header:", error);
      }
    }

    // Update operation to success with settlement info
    await updateOperationForSuccess(finalCorrelationId, method, baseURL, path, settlementInfo);

    return {
      status: response.status,
      statusText: response.statusText,
      data: response.data,
      headers: response.headers,
    };
  } catch (error) {
    // Check if this error was already handled by the payment interceptor
    if (error instanceof PaymentInterceptorError) {
      // Operations have already been updated by the interceptor, just re-throw
      console.log(`Payment interceptor already handled error: ${error.message}`);
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullUrl = `${baseURL}${path}`;
    const is402Error = errorMessage.includes("402") || errorMessage.includes("Payment Required");

    // Create error context
    const errorContext: ErrorHandlingContext = {
      correlationId: finalCorrelationId,
      fullUrl,
      method,
      baseURL,
      path,
      queryParams,
      body,
    };

    // Route to appropriate error handler
    if (is402Error) {
      handle402Error(error, errorContext);
    } else {
      handleNon402Error(error, errorContext);
    }
  }
}

/**
 * Updates operation status to success and handles settlement information.
 * Updates both HTTP and wallet operations if present, or creates a new success operation.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param method - The HTTP method that was used (GET, POST, etc.)
 * @param baseURL - The base URL of the request
 * @param path - The path component of the request URL
 * @param settlementInfo - Optional settlement information from the payment response
 * @returns {Promise<void>} Resolves when operations are updated
 */
async function updateOperationForSuccess(
  correlationId: string,
  method: string,
  baseURL: string,
  path: string,
  settlementInfo?: SettlementInfo,
): Promise<void> {
  const currentOperations = operationStore.getState().operations;

  // Find all pending operations with this correlation ID
  const pendingOperations = currentOperations.filter(
    op => op.correlationId === correlationId && op.status === "pending",
  );

  // Update operations to success - prioritize payment flow over generic success
  let httpOperationUpdated = false;

  pendingOperations.forEach(operation => {
    const index = currentOperations.indexOf(operation);

    if (operation.type === "wallet") {
      // Update wallet operation to show payment completed
      let blockExplorerUrl: string | undefined;

      if (settlementInfo?.transaction && settlementInfo?.network) {
        blockExplorerUrl = getBlockExplorerUrl(settlementInfo.network, settlementInfo.transaction);
        console.log(
          `Transaction completed: ${settlementInfo.transaction} on ${settlementInfo.network}`,
        );
      }

      operationStore.getState().updateWalletOperation(index, {
        description: `Payment completed successfully`,
        status: "success",
        errorMessage: undefined, // Clear any previous error message
        transactionHash: settlementInfo?.transaction,
        blockExplorerUrl: blockExplorerUrl,
      });
    } else if (operation.type === "http" && !httpOperationUpdated) {
      // Only update the first HTTP operation to avoid duplicates
      operationStore.getState().updateHttpOperation(index, {
        description: `Payment required: ${
          operation.selectedPayment
            ? formatUSDC(operation.selectedPayment.maxAmountRequired)
            : "unknown amount"
        }`,
        status: "success",
        errorMessage: undefined, // Clear any previous error message
        settlementInfo: settlementInfo, // Add settlement info with transaction hash
      });
      httpOperationUpdated = true;

      // Increment session spent using the selected payment's maxAmountRequired (atomic)
      const amountAtomic = operation.selectedPayment?.maxAmountRequired;
      if (amountAtomic) {
        try {
          budgetStore.getState().addSpentAtomic(amountAtomic);
        } catch {
          // ignore budget update failures
        }
      }
    }
  });

  // If no pending operations were found, add a fallback success operation
  if (pendingOperations.length === 0) {
    operationStore.getState().addHttpOperation(
      `Successfully completed ${method} request to ${baseURL}${path}`,
      "success",
      method,
      `${baseURL}${path}`,
      undefined,
      correlationId,
      undefined, // maxAmountPerRequest
      undefined, // paymentRequirements
      undefined, // selectedPayment
      settlementInfo, // Include settlement info
    );
  }
}
