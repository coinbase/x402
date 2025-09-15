import {
  VerifyResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactSuiPayload,
  ErrorReasons,
} from "../../../../types/verify";
import { SupportedSuiNetworks } from "../../../../types/shared";
import { Transaction } from "@mysten/sui/transactions";
import { SCHEME } from "../../";
import { fromBase64, normalizeStructTag, normalizeSuiAddress } from "@mysten/sui/utils";
import { bcs } from "@mysten/sui/bcs";
import { BalanceChange, SuiClient, TransactionEffects } from "@mysten/sui/client";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { getPackageId } from "../contract-config";

/**
 * Verify the payment payload against the payment requirements.
 *
 * @param client - The Sui client used to dryRun the transaction
 * @param payload - The payment payload to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify(
  client: SuiClient,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  try {
    // verify that the scheme and network are supported
    verifySchemesAndNetworks(payload, paymentRequirements);

    // decode the base64 encoded transaction
    const suiPayload = payload.payload as ExactSuiPayload;
    const transactionBytes = fromBase64(suiPayload.transaction);
    const transaction = Transaction.from(transactionBytes);
    const payer = Transaction.from(transactionBytes).getData().sender;

    if (!payer) {
      throw new Error(`invalid_exact_sui_payload_transaction_missing_payer`);
    }

    // Check if there's a nonce - if so, skip the transaction executed check
    const hasNonce = paymentRequirements.extra?.nonce !== undefined;

    await Promise.all([
      // Only verify transaction not executed if there's no nonce
      !hasNonce ? verifyTransactionNotExecuted(client, transaction) : Promise.resolve(),
      dryRunAndVerifyTransaction(client, transactionBytes, paymentRequirements),
      verifySignature(client, transactionBytes, suiPayload.signature, payer),
    ]);

    // Verify the balance changes match the requirements
    return {
      isValid: true,
      invalidReason: undefined,
      payer,
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

    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
    };
  }
}

/**
 * Verifies that the transaction has not already been executed.
 *
 * @param client - The Sui client used to check the transaction status
 * @param transaction - The transaction to check
 * @throws Error if the transaction has already been executed
 */
export async function verifyTransactionNotExecuted(
  client: SuiClient,
  transaction: Transaction,
): Promise<void> {
  const digest = await transaction.getDigest();

  try {
    const transactionResult = await client.getTransactionBlock({ digest });

    if (transactionResult) {
      throw new Error(`invalid_exact_sui_payload_transaction_already_executed`);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Could not find the referenced transaction")
    ) {
      return; // Transaction has not been executed yet
    }
    throw error; // Unexpected error
  }
}

/**
 * Dry runs the transaction and verifies the move call.
 *
 * @param client - The Sui client used to dryRun the transaction
 * @param transactionBytes - The transaction bytes to dryRun
 * @param paymentRequirements - The payment requirements to verify against
 */
export async function dryRunAndVerifyTransaction(
  client: SuiClient,
  transactionBytes: Uint8Array,
  paymentRequirements: PaymentRequirements,
): Promise<void> {
  const dryRunResult = await client.dryRunTransactionBlock({
    transactionBlock: transactionBytes,
  });

  if (!dryRunResult.effects) {
    throw new Error(`invalid_exact_sui_payload_transaction_dry_run_failed`);
  }

  // Parse the transaction to verify the move call
  const transaction = Transaction.from(transactionBytes);
  verifyMoveCall(transaction, paymentRequirements);

  // Also verify the effects are successful
  if (dryRunResult.effects.status.status !== "success") {
    throw new Error(`invalid_exact_sui_payload_transaction_execution_failed`);
  }

  // Verify the balance changes match the requirements (from dry run)
  if (dryRunResult.balanceChanges) {
    verifyEffectsAndBalanceChanges(
      dryRunResult.effects,
      dryRunResult.balanceChanges,
      paymentRequirements,
      "invalid_exact_sui_payload",
    );
  }
}

/**
 * Verifies that the transaction contains the correct move call to our x402 payments contract.
 *
 * @param transaction - The transaction to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @throws Error if the move call doesn't match the requirements
 */
export function verifyMoveCall(
  transaction: Transaction,
  paymentRequirements: PaymentRequirements,
): void {
  const txData = transaction.getData();
  const packageId = getPackageId(paymentRequirements.network);
  const expectedNonce = paymentRequirements.extra?.nonce ?? "";
  const expectedNonceBytes = new TextEncoder().encode(expectedNonce);

  // Find all move calls to our payments contract and track validation errors
  const validationErrors: string[] = [];

  for (const command of txData.commands) {
    if (command.$kind === "MoveCall") {
      // Check if this is a call to our contract
      if (
        normalizeSuiAddress(command.MoveCall.package) === normalizeSuiAddress(packageId) &&
        command.MoveCall.module === "payments" &&
        command.MoveCall.function === "make_payment"
      ) {
        try {
          // Verify the type arguments (coin type)
          if (
            command.MoveCall.typeArguments.length !== 1 ||
            normalizeStructTag(command.MoveCall.typeArguments[0]) !==
              normalizeStructTag(paymentRequirements.asset)
          ) {
            throw new Error(`invalid_exact_sui_payload_incorrect_coin_type`);
          }

          // Verify the arguments
          // The makePayment function expects: paymentCoin, expectedAmount, recipient, invoiceId
          const args = command.MoveCall.arguments;
          if (args.length !== 4) {
            throw new Error(`invalid_exact_sui_payload_incorrect_arguments`);
          }

          // Verify expectedAmount (args[1] should be an Input reference to a Pure value with the amount)
          const expectedAmountArg = args[1];
          let amountBytes: Uint8Array;

          if (expectedAmountArg.$kind === "Input") {
            // Look up the input in the transaction's inputs array
            const inputIndex = expectedAmountArg.Input;
            if (inputIndex < txData.inputs.length) {
              const input = txData.inputs[inputIndex];
              if (input.Pure) {
                // The bytes are base64-encoded, need to decode first
                amountBytes = fromBase64(input.Pure.bytes);
              } else {
                throw new Error(`invalid_exact_sui_payload_invalid_amount_argument`);
              }
            } else {
              throw new Error(`invalid_exact_sui_payload_invalid_amount_argument`);
            }
          } else {
            throw new Error(`invalid_exact_sui_payload_invalid_amount_argument`);
          }

          // Use BCS to parse the u64 amount
          const amount = BigInt(bcs.u64().parse(amountBytes));
          const expectedAmount = BigInt(paymentRequirements.maxAmountRequired);

          if (amount !== expectedAmount) {
            throw new Error(`invalid_exact_sui_payload_amount_mismatch`);
          }

          // Verify recipient (args[2] should be an Input reference to a Pure value with the address)
          const recipientArg = args[2];
          let recipientBytes: Uint8Array;

          if (recipientArg.$kind === "Input") {
            // Look up the input in the transaction's inputs array
            const inputIndex = recipientArg.Input;
            if (inputIndex < txData.inputs.length) {
              const input = txData.inputs[inputIndex];
              if (input.Pure) {
                // The bytes are base64-encoded, need to decode first
                recipientBytes = fromBase64(input.Pure.bytes);
              } else {
                throw new Error(`invalid_exact_sui_payload_invalid_recipient_argument`);
              }
            } else {
              throw new Error(`invalid_exact_sui_payload_invalid_recipient_argument`);
            }
          } else {
            throw new Error(`invalid_exact_sui_payload_invalid_recipient_argument`);
          }

          // Use BCS to parse the address
          const recipientAddress = bcs.Address.parse(recipientBytes);

          if (
            normalizeSuiAddress(recipientAddress) !== normalizeSuiAddress(paymentRequirements.payTo)
          ) {
            throw new Error(`invalid_exact_sui_payload_incorrect_recipient`);
          }

          // Verify nonce/invoiceId (args[3] should be an Input reference to a Pure value with the nonce bytes)
          const nonceArg = args[3];
          let nonceBytes: Uint8Array;

          if (nonceArg.$kind === "Input") {
            // Look up the input in the transaction's inputs array
            const inputIndex = nonceArg.Input;
            if (inputIndex < txData.inputs.length) {
              const input = txData.inputs[inputIndex];
              if (input.Pure) {
                // The bytes are base64-encoded, need to decode first
                nonceBytes = fromBase64(input.Pure.bytes);
              } else {
                throw new Error(`invalid_exact_sui_payload_invalid_nonce_argument`);
              }
            } else {
              throw new Error(`invalid_exact_sui_payload_invalid_nonce_argument`);
            }
          } else {
            throw new Error(`invalid_exact_sui_payload_invalid_nonce_argument`);
          }

          // Use BCS to parse the vector of bytes
          const parsedNonceBytes = bcs.vector(bcs.u8()).parse(nonceBytes);

          // Compare nonce bytes
          if (!arraysEqual(parsedNonceBytes, expectedNonceBytes)) {
            throw new Error(`invalid_exact_sui_payload_incorrect_nonce`);
          }

          // If we reach here, this move call is valid for the current payment requirements
          return; // Found a valid call, no need to continue
        } catch (error) {
          // Track this validation error but continue checking other calls
          if (error instanceof Error) {
            validationErrors.push(error.message);
          }
          // Continue to next command without throwing - there might be other valid calls
        }
      }
    }
  }

  // If we reach here, no valid call was found, throw the first error encountered
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0]);
  } else {
    throw new Error(`invalid_exact_sui_payload_move_call_not_found`);
  }
}

/**
 * Helper function to compare two arrays for equality.
 *
 * @param a - First array
 * @param b - Second array
 * @returns True if arrays are equal, false otherwise
 */
function arraysEqual(a: Uint8Array | number[], b: Uint8Array | number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
    !SupportedSuiNetworks.includes(paymentRequirements.network)
  ) {
    throw new Error("invalid_network");
  }
}

/**
 * Verifies that the transaction signature is valid.
 *
 * @param client - The Sui client used to verify the transaction signature
 * @param transactionBytes - The transaction bytes to verify
 * @param signature - The signature to verify
 * @param payer - The payer address
 * @returns A promise that resolves if the signature is valid, otherwise throws an error.
 */
async function verifySignature(
  client: SuiClient,
  transactionBytes: Uint8Array,
  signature: string,
  payer: string,
): Promise<void> {
  try {
    await verifyTransactionSignature(transactionBytes, signature, {
      // RPC client is used when verifying zklogin signatures
      client,
      address: payer,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    throw new Error(`invalid_exact_sui_payload_transaction_signature_verification_failed`);
  }
}

/**
 * Verifies that the transaction effects contain the expected balance changes.
 *
 * @param effects - The transaction effects to verify
 * @param balanceChanges - The balance changes to verify
 * @param paymentRequirements - The payment requirements to verify against
 * @param errorPrefix - The prefix to use for error messages (e.g., "invalid_exact_sui_payload" or "settle_exact_sui")
 * @throws Error if the balance changes don't match the requirements
 */
export function verifyEffectsAndBalanceChanges(
  effects: TransactionEffects,
  balanceChanges: BalanceChange[],
  paymentRequirements: PaymentRequirements,
  errorPrefix: string,
): void {
  if (!effects || effects.status.status !== "success") {
    throw new Error(`${errorPrefix}_transaction_execution_failed`);
  }

  const expectedCoinType = normalizeStructTag(paymentRequirements.asset);
  const payTo = normalizeSuiAddress(paymentRequirements.payTo);

  // Check balance changes to verify the payment amount
  const balanceChange = balanceChanges?.find(change => {
    if (
      change.owner &&
      typeof change.owner === "object" &&
      "AddressOwner" in change.owner &&
      normalizeStructTag(change.coinType) === expectedCoinType
    ) {
      return normalizeSuiAddress(change.owner.AddressOwner) === payTo;
    }
    return false;
  });

  if (!balanceChange) {
    throw new Error(`${errorPrefix}_transaction_balance_change_not_found`);
  }

  // Verify the balance change matches the required amount
  const requiredAmount = BigInt(paymentRequirements.maxAmountRequired);
  const actualAmount = BigInt(balanceChange.amount || 0);

  if (actualAmount < requiredAmount) {
    throw new Error(`${errorPrefix}_transaction_amount_mismatch`);
  }
}
