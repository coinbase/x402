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
import { BalanceChange, SuiClient, TransactionEffects } from "@mysten/sui/client";
import { verifyTransactionSignature } from "@mysten/sui/verify";

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

    await Promise.all([
      verifyTransactionNotExecuted(client, transaction),
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
    console.log("error", error);
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
 * Dry runs the transaction and verifies the balance changes.
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

  verifyEffectsAndBalanceChanges(
    dryRunResult.effects,
    dryRunResult.balanceChanges,
    paymentRequirements,
    "invalid_exact_sui_payload",
  );
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
  const actualAmount = BigInt(balanceChange.amount || 0n);

  if (actualAmount < requiredAmount) {
    throw new Error(`${errorPrefix}_transaction_amount_mismatch`);
  }
}
