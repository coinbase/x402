import { AxiosInstance } from "axios";
import { Chain } from "viem";
import { PaymentRequirements } from "x402/types";
import { operationStore } from "../stores/operations";
import { budgetStore } from "../stores/budget";
import { checkUSDCBalanceForPaymentAtomic } from "./balanceChecker";
import { formatUSDC } from "./chainConfig";

/**
 * Custom error class for payment interceptor failures.
 * Indicates that the error has already been handled by the interceptor
 * and operations have been updated accordingly.
 */
export class PaymentInterceptorError extends Error {
  public readonly handledByInterceptor = true;

  /**
   * Creates a new PaymentInterceptorError instance.
   *
   * @param message - The error message describing what went wrong
   */
  constructor(message: string) {
    super(message);
    this.name = "PaymentInterceptorError";
  }
}

/**
 * Creates Axios interceptors to handle x402 payment flow.
 * Handles 402 responses, balance checks, and payment retries.
 *
 * @param instance - Axios instance to add interceptors to
 * @param correlationId - Correlation ID for tracking operations
 * @param accountAddress - Wallet address for balance checking
 * @param chain - The blockchain chain to use for transactions
 * @param maxAmountPerRequest - Optional max amount per request
 * @param preDiscoveredPaymentRequirements - Optional pre-discovered payment requirements to handle proactively
 * @returns {AxiosInstance} The same axios instance with interceptors added
 */
export function createPaymentTrackingInterceptor(
  instance: AxiosInstance,
  correlationId: string,
  accountAddress: string,
  chain: Chain,
  maxAmountPerRequest?: number,
  preDiscoveredPaymentRequirements?: PaymentRequirements[],
): AxiosInstance {
  // Add response interceptor to handle 402 errors and track payment flow
  instance.interceptors.response.use(
    response => response,
    async error => {
      if (error.response?.status === 402 && error.response?.data?.accepts) {
        console.log(`Payment interceptor will handle 402 for correlation ${correlationId}`);

        // Extract payment requirements
        const paymentRequirements = error.response.data.accepts;
        const selectedPayment = paymentRequirements?.[0];

        // Update the pending HTTP operation to show discovery
        await updateOperationForDiscovery(correlationId, paymentRequirements, selectedPayment);

        // Perform budget checks
        if (maxAmountPerRequest && selectedPayment) {
          try {
            await performBudgetChecks(correlationId, maxAmountPerRequest, selectedPayment);
            console.log(`Budget check passed - payment flow will continue`);
          } catch (error) {
            // Budget check failed, request will not proceed
            throw error;
          }
        }

        // Perform upfront balance checking
        if (selectedPayment) {
          try {
            await performBalanceChecks(correlationId, accountAddress, selectedPayment, chain);
            console.log(`Balance check passed - payment flow will continue`);
          } catch (error) {
            // Balance check failed, request will not proceed
            throw error;
          }
        }
      }
      return Promise.reject(error);
    },
  );

  // Add request interceptor to handle pre-discovered payment requirements and track payment retries
  instance.interceptors.request.use(
    async config => {
      // Handle pre-discovered payment requirements - proactively create payment
      if (
        preDiscoveredPaymentRequirements &&
        preDiscoveredPaymentRequirements.length > 0 &&
        !config.headers?.["X-PAYMENT"]
      ) {
        console.log(
          `Proactively creating payment for pre-discovered requirements (correlation ${correlationId})`,
        );

        const selectedPayment = preDiscoveredPaymentRequirements[0];

        // Update operation to show we're creating payment authorization
        await updateOperationForDiscovery(
          correlationId,
          preDiscoveredPaymentRequirements,
          selectedPayment,
        );

        // Perform budget checks
        if (maxAmountPerRequest && selectedPayment) {
          try {
            await performBudgetChecks(correlationId, maxAmountPerRequest, selectedPayment);
            console.log(`Budget check passed - payment flow will continue`);
          } catch (error) {
            // Budget check failed, request will not proceed
            throw error;
          }
        }

        // Perform balance checks
        try {
          await performBalanceChecks(correlationId, accountAddress, selectedPayment, chain);
          console.log(`Balance check passed - payment flow will continue`);
        } catch (error) {
          // Balance check failed, request will not proceed
          throw error;
        }
      }

      // Check if this request has an X-PAYMENT header (indicates retry after payment)
      if (config.headers?.["X-PAYMENT"] || config.headers?.["x-payment"]) {
        console.log(`Retrying request with payment header for correlation ${correlationId}`);
        updateOperationForPaymentRetry(correlationId);
      }
      return config;
    },
    error => Promise.reject(error),
  );

  return instance;
}

/**
 * Updates operations store when a 402 payment requirement is discovered.
 * Updates the pending HTTP operation with payment details and requirements.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param paymentRequirements - Array of available payment options from the 402 response
 * @param selectedPayment - The selected payment option to process
 * @returns {Promise<void>} Resolves when operations are updated
 */
async function updateOperationForDiscovery(
  correlationId: string,
  paymentRequirements: PaymentRequirements[],
  selectedPayment: PaymentRequirements,
): Promise<void> {
  const currentOperations = operationStore.getState().operations;
  const pendingOpIndex = currentOperations.findIndex(
    op => op.correlationId === correlationId && op.status === "pending" && op.type === "http",
  );

  if (pendingOpIndex !== -1) {
    const paymentAmountFormatted = formatUSDC(selectedPayment.maxAmountRequired);

    operationStore.getState().updateHttpOperation(pendingOpIndex, {
      description: `Payment required: $${paymentAmountFormatted} USDC`,
      status: "pending",
      paymentRequirements: paymentRequirements,
      selectedPayment: selectedPayment,
    });
  }

  console.log(
    `Payment required: ${selectedPayment?.maxAmountRequired} ${selectedPayment?.asset} on ${selectedPayment?.network}`,
  );
}

/**
 * Performs comprehensive balance checks before attempting payment.
 * Verifies USDC balance is sufficient and updates operations accordingly.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param accountAddress - The wallet address to check balance for
 * @param selectedPayment - The payment requirements to check balance against
 * @param chain - The blockchain chain to check balance on
 * @returns {Promise<void>} Resolves when balance checks are complete
 * @throws {PaymentInterceptorError} If balance is insufficient
 */
async function performBalanceChecks(
  correlationId: string,
  accountAddress: string,
  selectedPayment: PaymentRequirements,
  chain: Chain,
): Promise<void> {
  const balanceCheck = await checkUSDCBalanceForPaymentAtomic(
    accountAddress as `0x${string}`,
    selectedPayment.maxAmountRequired,
    chain,
  );

  const formattedPaymentAmount = formatUSDC(selectedPayment.maxAmountRequired);

  if (!balanceCheck.isSufficient) {
    const errorMessage = `Insufficient USDC balance (need ${formatUSDC(
      selectedPayment.maxAmountRequired,
    )}, have ${balanceCheck.formattedBalance})`;

    console.error(`Balance check failed: ${errorMessage}`);

    // Update operations to show insufficient balance
    await updateOperationsForInsufficientBalance(correlationId, errorMessage, accountAddress);

    throw new PaymentInterceptorError(errorMessage);
  }

  console.log(
    `Balance check passed: ${balanceCheck.formattedBalance} available, ${formattedPaymentAmount} required`,
  );

  const description = `Processing payment: $${formattedPaymentAmount} USDC`;

  operationStore
    .getState()
    .addWalletOperation(
      description,
      "pending",
      "sign",
      accountAddress,
      undefined,
      undefined,
      undefined,
      correlationId,
    );
}

/**
 * Updates operations when insufficient balance is detected.
 * Updates both HTTP and wallet operations to reflect the balance error.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param errorMessage - The error message explaining the insufficient balance
 * @param accountAddress - The wallet address that had insufficient balance
 * @returns {Promise<void>} Resolves when operations are updated
 */
async function updateOperationsForInsufficientBalance(
  correlationId: string,
  errorMessage: string,
  accountAddress: string,
): Promise<void> {
  const description = `Payment failed - insufficient USDC balance`;
  // Update HTTP operation
  const currentOperations = operationStore.getState().operations;
  const pendingOpIndex = currentOperations.findIndex(
    op => op.correlationId === correlationId && op.status === "pending" && op.type === "http",
  );

  if (pendingOpIndex !== -1) {
    operationStore.getState().updateHttpOperation(pendingOpIndex, {
      description,
      status: "error",
      errorMessage: errorMessage,
    });
  }

  // Add wallet operation showing the balance failure
  operationStore
    .getState()
    .addWalletOperation(
      description,
      "error",
      "sign",
      accountAddress,
      errorMessage,
      undefined,
      undefined,
      correlationId,
    );
}

/**
 * Updates operations when a payment retry is attempted.
 * Marks the pending wallet operation as completed successfully.
 *
 * @param correlationId - ID to correlate this operation with others
 * @returns {void} No return value
 */
function updateOperationForPaymentRetry(correlationId: string): void {
  // Update the pending wallet operation to show payment authorization completed
  const currentOperations = operationStore.getState().operations;
  const pendingWalletOpIndex = currentOperations.findIndex(
    op => op.correlationId === correlationId && op.status === "pending" && op.type === "wallet",
  );

  if (pendingWalletOpIndex !== -1) {
    operationStore.getState().updateWalletOperation(pendingWalletOpIndex, {
      description: `Payment authorization completed`,
      status: "success",
    });
  }

  // Note: We don't add a new HTTP operation here since it would be redundant
  // The original HTTP operation will be updated to success when the request completes
}

/**
 * Performs budget checks before attempting payment.
 * Verifies that the max amount per request is not exceeded.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param maxAmountPerRequest - The max amount per request
 * @param selectedPayment - The selected payment option to check against
 */
async function performBudgetChecks(
  correlationId: string,
  maxAmountPerRequest: number,
  selectedPayment: PaymentRequirements,
) {
  console.log("Performing budget checks");
  if (maxAmountPerRequest && selectedPayment) {
    const selectedPaymentAmount = Number(selectedPayment.maxAmountRequired);

    console.log(
      `Max amount per request: ${maxAmountPerRequest}, selected payment: ${selectedPaymentAmount}`,
    );

    if (selectedPaymentAmount > maxAmountPerRequest) {
      const errorMessage = `Payment required: $${formatUSDC(
        selectedPayment.maxAmountRequired,
      )} is greater than max amount per request: $${formatUSDC(maxAmountPerRequest.toString())}`;

      console.error(`Budget check failed: ${errorMessage}`);

      // Update operations to show insufficient budget
      await updateOperationForBudgetCheckFailure(correlationId, errorMessage);

      throw new PaymentInterceptorError(errorMessage);
    }

    const { sessionBudgetAtomic, sessionSpentAtomic } = budgetStore.getState();
    if (sessionBudgetAtomic) {
      const remaining = Number(sessionBudgetAtomic) - Number(sessionSpentAtomic || "0");
      if (selectedPaymentAmount > remaining) {
        const errorMessage = `Payment required: $${formatUSDC(
          selectedPayment.maxAmountRequired,
        )} exceeds remaining session budget: $${formatUSDC(remaining.toString())}`;

        console.error(`Budget check failed: ${errorMessage}`);

        await updateOperationForBudgetCheckFailure(correlationId, errorMessage);

        throw new PaymentInterceptorError(errorMessage);
      }
    }
  } else {
    console.log("No max amount per request or selected payment found");
  }
}

/**
 * Updates operations when budget check fails.
 * Updates both HTTP and wallet operations to reflect the budget error.
 *
 * @param correlationId - ID to correlate this operation with others
 * @param errorMessage - The error message explaining the budget error
 * @returns {Promise<void>} Resolves when operations are updated
 */
async function updateOperationForBudgetCheckFailure(
  correlationId: string,
  errorMessage: string,
): Promise<void> {
  const description = "Payment failed - insufficient budget";
  // Update HTTP operation
  const currentOperations = operationStore.getState().operations;
  const pendingOpIndex = currentOperations.findIndex(
    op => op.correlationId === correlationId && op.status === "pending" && op.type === "http",
  );

  console.log("pendingOpIndex", pendingOpIndex);

  if (pendingOpIndex !== -1) {
    operationStore.getState().updateHttpOperation(pendingOpIndex, {
      description,
      status: "error",
      errorMessage: errorMessage,
    });
  }
}
