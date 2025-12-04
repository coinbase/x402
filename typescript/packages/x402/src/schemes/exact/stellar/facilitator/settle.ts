import { rpc, Transaction, TransactionBuilder, Operation, xdr } from "@stellar/stellar-sdk";

import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  ExactStellarPayloadSchema,
  ErrorReason,
} from "../../../../types/verify";
import { X402Config } from "../../../../types/config";
import { Network } from "../../../../types";
import { getNetworkPassphrase, getRpcClient } from "../../../../shared/stellar/rpc";
import { Ed25519Signer } from "../../../../shared/stellar/signer";
import { verify } from "./verify";

const DEFAULT_TIMEOUT_SECONDS = 60;

/**
 * Creates a successful settlement response
 *
 * @param txHash - Transaction hash
 * @param network - Network name
 * @param payer - Payer address
 * @returns Successful settlement response
 */
function successResponse(txHash: string, network: Network, payer?: string): SettleResponse {
  return {
    success: true,
    transaction: txHash,
    network,
    payer,
  };
}

/**
 * Creates a failed settlement response
 *
 * @param reason - Error reason code
 * @param network - Network name
 * @param payer - Optional payer address
 * @param txHash - Optional transaction hash (for failures after submission)
 * @returns Failed settlement response
 */
function errorResponse(
  reason: ErrorReason,
  network: Network,
  payer?: string,
  txHash = "",
): SettleResponse {
  return {
    success: false,
    errorReason: reason,
    transaction: txHash,
    network,
    payer,
  };
}

/**
 * Settles a Stellar payment by submitting the transaction on-chain.
 *
 * Settlement flow:
 * 1. Verify payment is valid
 * 2. Parse transaction
 * 3. Rebuild transaction with facilitator as source
 * 4. Sign and submit transaction
 * 5. Poll for confirmation
 *
 * @param signer - Stellar signer for the facilitator
 * @param payload - Payment payload from X-PAYMENT header
 * @param paymentRequirements - Original payment requirements
 * @param config - Optional configuration
 * @returns SettleResponse with transaction hash or error
 */
export async function settle(
  signer: Ed25519Signer,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  config?: X402Config,
): Promise<SettleResponse> {
  const { network } = payload;
  const server = getRpcClient(paymentRequirements.network, config);
  const networkPassphrase = getNetworkPassphrase(paymentRequirements.network);
  let payer: string | undefined;
  let txHash: string | undefined;

  try {
    // 1. Verify payment before settlement
    const verifyResult = await verify(signer, payload, paymentRequirements, config);

    if (!verifyResult.isValid) {
      return errorResponse(verifyResult.invalidReason!, network, verifyResult.payer);
    }

    payer = verifyResult.payer;

    // 2. Parse transaction envelope once to extract both transaction and Soroban data
    const stellarPayload = ExactStellarPayloadSchema.parse(payload.payload);
    const txEnvelope = xdr.TransactionEnvelope.fromXDR(stellarPayload.transaction, "base64");
    const transaction = new Transaction(stellarPayload.transaction, networkPassphrase);
    const sorobanData = txEnvelope.v1()?.tx()?.ext()?.sorobanData() || undefined;

    // Validate Soroban data is present for Soroban transactions
    if (!sorobanData) {
      console.error("Missing Soroban data in transaction");
      return errorResponse("invalid_exact_stellar_payload_malformed", network, payer);
    }

    // 3. Extract operation
    const invokeOp = transaction.operations[0] as Operation.InvokeHostFunction;

    // 4. Rebuild transaction with facilitator as source
    const facilitatorAccount = await server.getAccount(signer.address);

    const rebuiltTx = new TransactionBuilder(facilitatorAccount, {
      fee: transaction.fee,
      networkPassphrase,
      ledgerbounds: transaction.ledgerBounds,
      memo: transaction.memo,
      minAccountSequence: transaction.minAccountSequence,
      minAccountSequenceAge: transaction.minAccountSequenceAge,
      minAccountSequenceLedgerGap: transaction.minAccountSequenceLedgerGap,
      extraSigners: transaction.extraSigners,
      sorobanData,
    })
      .setTimeout(paymentRequirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)
      .addOperation(
        Operation.invokeHostFunction({
          func: invokeOp.func,
          auth: invokeOp.auth || [],
          source: invokeOp.source,
        }),
      )
      .build();

    // 5. Sign transaction with facilitator's key
    const { signedTxXdr, error: signError } = await signer.signTransaction(rebuiltTx.toXDR(), {
      networkPassphrase,
    });

    if (signError) {
      console.error("Error signing transaction:", signError);
      return errorResponse("settle_exact_stellar_transaction_signing_failed", network, payer);
    }

    const signedTx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as Transaction;

    // 6. Submit transaction to network
    const sendResult = await server.sendTransaction(signedTx);

    if (sendResult.status !== "PENDING") {
      console.error("Transaction submission failed with unexpected status:", sendResult.status);
      return errorResponse("settle_exact_stellar_transaction_submission_failed", network, payer);
    }

    // 7. Poll for transaction confirmation
    txHash = sendResult.hash;
    const maxPollAttempts = paymentRequirements.maxTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    const confirmResult = await pollForTransaction(server, txHash, maxPollAttempts);

    if (!confirmResult.success) {
      console.error(`Transaction ${txHash} failed or timed out`);
      return errorResponse("settle_exact_stellar_transaction_failed", network, payer, txHash);
    }

    // 8. Return success
    return successResponse(txHash, network, payer);
  } catch (error) {
    console.error("Unexpected settlement error:", error);
    return errorResponse("unexpected_settle_error", network, payer, txHash);
  }
}

/**
 * Polls for transaction confirmation on Soroban.
 *
 * @param server - Soroban RPC server
 * @param txHash - Transaction hash to poll for
 * @param maxPollAttempts - Maximum number of polling attempts (default: 15)
 * @param delayMs - Delay between attempts in milliseconds (default: 1000)
 * @returns Result with success status
 */
async function pollForTransaction(
  server: rpc.Server,
  txHash: string,
  maxPollAttempts = 15,
  delayMs = 1000,
): Promise<{ success: boolean }> {
  for (let i = 0; i < maxPollAttempts; i++) {
    try {
      const txResult = await server.getTransaction(txHash);

      if (txResult.status === "SUCCESS") {
        return { success: true };
      } else if (txResult.status === "FAILED") {
        return { success: false };
      }

      // Transaction still pending, wait and retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch {
      // Continue polling on error
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Timeout
  return { success: false };
}
