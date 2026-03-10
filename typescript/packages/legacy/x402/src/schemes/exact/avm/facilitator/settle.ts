import {
  decodeSignedTransaction as decodeSignedTxn,
  decodeTransaction as decodeUnsignedTxn,
  encodeTransactionRaw,
} from "@algorandfoundation/algokit-utils/transact";
import type { SignedTransaction, Transaction } from "@algorandfoundation/algokit-utils/transact";
import { PaymentPayload, PaymentRequirements, SettleResponse } from "../../../../types/verify";
import { WalletAccount, ExactAvmPayload } from "../types";
import { verify } from "./verify";

/**
 * Decodes a base64-encoded signed transaction string into an Algorand transaction object
 *
 * @param encodedTxn - The base64-encoded signed transaction string
 * @returns The decoded Algorand signed transaction
 */
function decodeSignedTransaction(encodedTxn: string): SignedTransaction {
  const txnBytes = Buffer.from(encodedTxn, "base64");
  const decodedSignedTxn = decodeSignedTxn(txnBytes);
  return decodedSignedTxn;
}

/**
 * Decodes a base64-encoded unsigned transaction string into an Algorand transaction object
 *
 * @param encodedTxn - The base64-encoded unsigned transaction string
 * @returns The decoded Algorand transaction
 */
function decodeTransaction(encodedTxn: string): Transaction {
  const txnBytes = Buffer.from(encodedTxn, "base64");
  return decodeUnsignedTxn(txnBytes);
}

/**
 * Settles a payment by executing an Algorand transaction according to the AVM exact specification
 *
 * Settlement steps:
 * 1. Verify the payment payload is valid using the verify function
 * 2. For transactions with a fee payer, sign the fee payer transaction
 * 3. Submit the transaction group to the Algorand network
 * 4. Return the transaction ID as proof of payment
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transaction parameters
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle(
  wallet: WalletAccount,
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  let payer = "unknown";
  try {
    const exactAvmPayload = paymentPayload.payload as ExactAvmPayload;
    if (
      !exactAvmPayload ||
      !exactAvmPayload.paymentGroup ||
      exactAvmPayload.paymentIndex >= exactAvmPayload.paymentGroup.length
    ) {
      return {
        success: false,
        errorReason: "invalid_exact_avm_payload_transaction",
        transaction: "",
        network: paymentPayload.network,
        payer,
      };
    }

    // First verify the payload is valid
    const validationResult = await verify(
      { client: wallet.client, network: paymentPayload.network },
      paymentPayload,
      paymentRequirements,
    );

    if (!validationResult.isValid) {
      console.error("Payment validation failed:", validationResult);
      return {
        success: false,
        errorReason: validationResult.invalidReason,
        transaction: "",
        network: paymentPayload.network,
        payer: validationResult.payer || payer,
      };
    }

    // Extract payment transaction and determine payer
    const signedPaymentTxn = decodeSignedTransaction(
      exactAvmPayload.paymentGroup[exactAvmPayload.paymentIndex],
    );
    payer = signedPaymentTxn.txn.sender.toString();

    // Prepare the transaction group for submission
    const txnGroupBytes: Uint8Array[] = [];
    const feePayer = (paymentRequirements.extra as { feePayer?: string } | undefined)?.feePayer;

    // If there's a fee payer, identify and sign those transactions
    if (feePayer) {
      for (let i = 0; i < exactAvmPayload.paymentGroup.length; i++) {
        const txnBase64 = exactAvmPayload.paymentGroup[i];

        try {
          // Try to decode as signed transaction
          decodeSignedTransaction(txnBase64);
          txnGroupBytes.push(Buffer.from(txnBase64, "base64"));
        } catch {
          // If not signed, it might be a fee payer transaction that needs signing
          const unsignedTxn = decodeTransaction(txnBase64);

          if (unsignedTxn.sender.toString() === feePayer) {
            // This is a facilitator transaction that needs signing
            const signedFeePayerTxn = await wallet.signTransactions([
              encodeTransactionRaw(unsignedTxn),
            ]);

            if (!signedFeePayerTxn[0]) {
              console.error("Fee payer transaction signing failed");
              return {
                success: false,
                errorReason: "settle_exact_avm_transaction_failed",
                transaction: "",
                network: paymentPayload.network,
                payer,
              };
            }

            txnGroupBytes.push(signedFeePayerTxn[0]);
          } else {
            // Unexpected unsigned transaction
            console.error("Unexpected unsigned transaction in group");
            return {
              success: false,
              errorReason: "invalid_exact_avm_payload_transaction",
              transaction: "",
              network: paymentPayload.network,
              payer,
            };
          }
        }
      }
    } else {
      // No fee payer, just use the signed user transaction
      txnGroupBytes.push(
        Buffer.from(exactAvmPayload.paymentGroup[exactAvmPayload.paymentIndex], "base64"),
      );
    }

    // Submit the transaction group to the Algorand network
    const result = await wallet.client.sendRawTransaction(txnGroupBytes);

    // Return the transaction ID as proof of payment
    return {
      success: true,
      transaction: result.txId,
      network: paymentPayload.network,
      payer,
    };
  } catch (error) {
    console.error("Error during settlement:", error);
    return {
      success: false,
      errorReason: "settle_exact_avm_transaction_failed",
      transaction: "",
      network: paymentPayload.network,
      payer,
    };
  }
}
