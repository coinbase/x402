import {
  VerifyResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactHederaPayload,
  ErrorReasons,
} from "../../../../types/verify";
import { SupportedHederaNetworks } from "../../../../types/shared";
import {
  Transaction,
  AccountId,
  TokenId,
  TransferTransaction,
  TokenTransferTransaction,
  TransactionId,
  Hbar,
} from "@hashgraph/sdk";
import {
  HederaSigner,
  deserializeTransaction,
  getHederaClient,
} from "../../../../shared/hedera";
import { SCHEME } from "../../";

/**
 * Verify the payment payload against the payment requirements.
 *
 * @param signer - The Hedera signer that will verify the transaction
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  signer: HederaSigner,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  try {
    // verify that the scheme and network are supported
    verifySchemesAndNetworks(payload, paymentRequirements);

    // decode the base64 encoded transaction
    const hederaPayload = payload.payload as ExactHederaPayload;
    const transaction = deserializeTransaction(hederaPayload.transaction);

    // perform transaction introspection to validate the transaction structure and details
    await transactionIntrospection(transaction, paymentRequirements);

    return {
      isValid: true,
      invalidReason: undefined,
    };
  } catch (error) {
    // if the error is one of the known error reasons, return the error reason
    if (error instanceof Error) {
      if (ErrorReasons.includes(error.message as (typeof ErrorReasons)[number])) {
        return {
          isValid: false,
          invalidReason: error.message as (typeof ErrorReasons)[number],
        };
      }
    }

    // if the error is not one of the known error reasons, return an unexpected error reason
    console.error(error);
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
    };
  }
}

/**
 * Verify that the scheme and network are supported.
 *
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 */
export function verifySchemesAndNetworks(
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): void {
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    throw new Error("unsupported_scheme");
  }

  if (
    payload.network !== paymentRequirements.network ||
    !SupportedHederaNetworks.includes(paymentRequirements.network)
  ) {
    throw new Error("invalid_network");
  }
}

/**
 * Perform transaction introspection to validate the transaction structure and transfer details.
 *
 * @param transaction - The Hedera transaction to inspect
 * @param paymentRequirements - The payment requirements to verify against
 */
export async function transactionIntrospection(
  transaction: Transaction,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  // Validate that this is a transfer transaction
  if (!(transaction instanceof TransferTransaction || transaction instanceof TokenTransferTransaction)) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }

  // Get the transaction details
  const transactionBody = transaction._makeTransactionBody();
  
  if (transaction instanceof TransferTransaction) {
    // HBAR transfer validation
    await validateHbarTransfer(transactionBody, paymentRequirements);
  } else if (transaction instanceof TokenTransferTransaction) {
    // Token transfer validation
    await validateTokenTransfer(transactionBody, paymentRequirements);
  }
}

/**
 * Validates HBAR transfer details
 *
 * @param transactionBody - The transaction body to validate
 * @param paymentRequirements - The payment requirements to verify against
 */
async function validateHbarTransfer(
  transactionBody: any,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  const transfers = transactionBody.cryptoTransfer?.transfers?.accountAmounts || [];
  
  // Find the positive transfer (recipient)
  const positiveTransfer = transfers.find((transfer: any) => transfer.amount > 0);
  if (!positiveTransfer) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }

  // Validate recipient
  const recipientAccountId = AccountId.fromString(paymentRequirements.payTo);
  if (positiveTransfer.accountID.toString() !== recipientAccountId.toString()) {
    throw new Error("invalid_exact_hedera_payload_transaction_recipient_mismatch");
  }

  // Validate amount
  const transferAmount = Math.abs(positiveTransfer.amount);
  if (transferAmount.toString() !== paymentRequirements.maxAmountRequired) {
    throw new Error("invalid_exact_hedera_payload_transaction_amount_mismatch");
  }

  // Validate asset (should be HBAR)
  if (!(paymentRequirements.asset === "0.0.0" || paymentRequirements.asset.toLowerCase() === "hbar")) {
    throw new Error("invalid_exact_hedera_payload_transaction_asset_mismatch");
  }
}

/**
 * Validates token transfer details
 *
 * @param transactionBody - The transaction body to validate
 * @param paymentRequirements - The payment requirements to verify against
 */
async function validateTokenTransfer(
  transactionBody: any,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  const tokenTransfers = transactionBody.cryptoTransfer?.tokenTransfers || [];
  
  if (tokenTransfers.length === 0) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }

  // Find transfers for the specified token
  const requiredTokenId = TokenId.fromString(paymentRequirements.asset);
  const relevantTransfer = tokenTransfers.find((tokenTransfer: any) => 
    tokenTransfer.token?.toString() === requiredTokenId.toString()
  );

  if (!relevantTransfer) {
    throw new Error("invalid_exact_hedera_payload_transaction_asset_mismatch");
  }

  // Find the positive transfer (recipient)
  const positiveTransfer = relevantTransfer.transfers?.find((transfer: any) => transfer.amount > 0);
  if (!positiveTransfer) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }

  // Validate recipient
  const recipientAccountId = AccountId.fromString(paymentRequirements.payTo);
  if (positiveTransfer.accountID.toString() !== recipientAccountId.toString()) {
    throw new Error("invalid_exact_hedera_payload_transaction_recipient_mismatch");
  }

  // Validate amount
  const transferAmount = Math.abs(positiveTransfer.amount);
  if (transferAmount.toString() !== paymentRequirements.maxAmountRequired) {
    throw new Error("invalid_exact_hedera_payload_transaction_amount_mismatch");
  }
}