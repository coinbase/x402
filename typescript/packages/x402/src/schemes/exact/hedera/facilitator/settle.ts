import {
  SettleResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactHederaPayload,
  ErrorReasons,
} from "../../../../types/verify";
import {
  Transaction,
  TransactionResponse,
  Status,
} from "@hashgraph/sdk";
import {
  HederaSigner,
  deserializeTransaction,
  addSignatureToTransaction,
} from "../../../../shared/hedera";
import { verify } from "./verify";

/**
 * Settle the payment payload against the payment requirements.
 *
 * @param signer - The Hedera signer that will sign and submit the transaction
 * @param payload - The payment payload to settle
 * @param paymentRequirements - The payment requirements to settle against
 * @returns A SettleResponse indicating if the payment is settled and any error reason
 */
export async function settle(
  signer: HederaSigner,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // First verify the payment
  const verifyResponse = await verify(signer, payload, paymentRequirements);
  if (!verifyResponse.isValid) {
    return {
      success: false,
      errorReason: verifyResponse.invalidReason,
      network: payload.network,
      transaction: "",
    };
  }

  const hederaPayload = payload.payload as ExactHederaPayload;
  const transaction = deserializeTransaction(hederaPayload.transaction);
  const payer = signer.accountId.toString();

  try {
    const { success, errorReason, transactionId } = await executeTransaction(
      transaction,
      signer
    );

    return {
      success,
      errorReason,
      payer,
      transaction: transactionId,
      network: payload.network,
    };
  } catch (error) {
    console.error("Unexpected error during transaction settlement:", error);
    return {
      success: false,
      errorReason: "unexpected_settle_error",
      network: payload.network,
      transaction: "",
    };
  }
}

/**
 * Execute a Hedera transaction by adding facilitator signature and submitting to network
 *
 * @param transaction - The transaction to execute
 * @param signer - The facilitator signer
 * @returns The execution result with success status and transaction ID
 */
export async function executeTransaction(
  transaction: Transaction,
  signer: HederaSigner,
): Promise<{ 
  success: boolean; 
  errorReason?: (typeof ErrorReasons)[number]; 
  transactionId: string 
}> {
  try {
    // Add facilitator signature to the transaction
    const signedTransaction = addSignatureToTransaction(transaction, signer);
    
    // Submit the transaction to the Hedera network
    const transactionResponse = await signedTransaction.execute(signer.client);
    
    // Wait for the transaction to be processed
    const receipt = await transactionResponse.getReceipt(signer.client);
    
    // Check if the transaction was successful
    if (receipt.status === Status.Success) {
      return {
        success: true,
        transactionId: transactionResponse.transactionId.toString(),
      };
    } else {
      return {
        success: false,
        errorReason: "settle_exact_hedera_transaction_failed",
        transactionId: transactionResponse.transactionId.toString(),
      };
    }
  } catch (error) {
    console.error("Transaction execution failed:", error);
    
    // Check for specific Hedera errors
    if (error instanceof Error) {
      if (error.message.includes("INSUFFICIENT_ACCOUNT_BALANCE")) {
        return {
          success: false,
          errorReason: "invalid_exact_hedera_payload_transaction_insufficient_balance",
          transactionId: "",
        };
      }
      
      if (error.message.includes("timeout") || error.message.includes("TIMEOUT")) {
        return {
          success: false,
          errorReason: "settle_exact_hedera_transaction_confirmation_timeout",
          transactionId: "",
        };
      }
    }

    return {
      success: false,
      errorReason: "settle_exact_hedera_transaction_failed",
      transactionId: "",
    };
  }
}

/**
 * Check transaction status with timeout
 *
 * @param transactionResponse - The transaction response from execution
 * @param client - The Hedera client
 * @param timeoutMs - Timeout in milliseconds (default: 30 seconds)
 * @returns The transaction receipt
 */
export async function waitForTransactionWithTimeout(
  transactionResponse: TransactionResponse,
  client: any,
  timeoutMs: number = 30000
): Promise<any> {
  return Promise.race([
    transactionResponse.getReceipt(client),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Transaction confirmation timeout")), timeoutMs)
    ),
  ]);
}