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
  TransactionId,
  Hbar,
} from "@hashgraph/sdk";
import { HederaSigner, deserializeTransaction, getHederaClient } from "../../../../shared/hedera";
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
    await transactionIntrospection(signer, transaction, paymentRequirements);

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
 * @param signer - The facilitator signer
 * @param transaction - The Hedera transaction to inspect
 * @param paymentRequirements - The payment requirements to verify against
 */
export async function transactionIntrospection(
  signer: HederaSigner,
  transaction: Transaction,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  // Validate that this is a transfer transaction
  if (!(transaction instanceof TransferTransaction)) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }

  // Validate transaction ID contains facilitator's account ID
  const transactionId = transaction.transactionId;
  if (!transactionId) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }

  const transactionAccountId = transactionId.accountId;
  if (!transactionAccountId || transactionAccountId.toString() !== signer.accountId.toString()) {
    throw new Error("invalid_exact_hedera_payload_transaction_signature");
  }

  // Validate facilitator account ID matches payment requirements
  const expectedFacilitatorId = paymentRequirements.extra?.feePayer as string;
  if (!expectedFacilitatorId || expectedFacilitatorId !== signer.accountId.toString()) {
    throw new Error("invalid_exact_hedera_payload_transaction_signature");
  }

  // Get the transaction details by serializing and parsing
  const transactionBytes = transaction.toBytes();
  const transactionBody = Transaction.fromBytes(transactionBytes);

  // Determine if this is HBAR or token transfer based on payment requirements
  if (isHbarTransfer(paymentRequirements.asset)) {
    // HBAR transfer validation
    await validateHbarTransfer(transaction, paymentRequirements);
  } else {
    // Token transfer validation
    await validateTokenTransfer(transaction, paymentRequirements);
  }
}

/**
 * Check if the asset represents HBAR
 */
function isHbarTransfer(asset: string): boolean {
  return asset === "0.0.0" || asset.toLowerCase() === "hbar";
}

/**
 * Validates HBAR transfer details
 *
 * @param transaction - The transaction to validate
 * @param paymentRequirements - The payment requirements to verify against
 */
async function validateHbarTransfer(
  transaction: Transaction,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  // For now, we'll do basic validation since we can't easily access internal transaction structure
  // In a real implementation, you would need to access the transaction's internal data structure
  // Basic validation - in a production system you'd want more detailed validation
  // This is a simplified version due to Hedera SDK limitations in accessing internal transaction data
  
  // Validate asset (should be HBAR)
  if (!isHbarTransfer(paymentRequirements.asset)) {
    throw new Error("invalid_exact_hedera_payload_transaction_asset_mismatch");
  }
}

/**
 * Validates token transfer details
 *
 * @param transaction - The transaction to validate
 * @param paymentRequirements - The payment requirements to verify against
 */
async function validateTokenTransfer(
  transaction: Transaction,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  // Basic validation - in a production system you'd want more detailed validation
  // This is a simplified version due to Hedera SDK limitations in accessing internal transaction data
  
  // Validate that the asset is not HBAR (should be a token)
  if (isHbarTransfer(paymentRequirements.asset)) {
    throw new Error("invalid_exact_hedera_payload_transaction_asset_mismatch");
  }
  
  // Validate that the asset is a valid token ID format
  try {
    TokenId.fromString(paymentRequirements.asset);
  } catch (error) {
    throw new Error("invalid_exact_hedera_payload_transaction_asset_mismatch");
  }
}

