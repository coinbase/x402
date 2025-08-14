import {
  SettleResponse,
  PaymentPayload,
  PaymentRequirements,
  ExactSuiPayload,
  ErrorReasons,
} from "../../../../types/verify";
import { verifyEffectsAndBalanceChanges } from "./verify";
import { fromBase64 } from "@mysten/sui/utils";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

/**
 * Settle the payment by executing the transaction on the Sui network.
 *
 * @param client - The Sui client used to execute the transaction
 * @param payload - The payment payload containing the transaction to settle
 * @param paymentRequirements - The payment requirements
 * @returns A SettleResponse indicating success or failure with transaction details
 */
export async function settle(
  client: SuiClient,
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResponse> {
  // TODO: Do we need to verify again here? In all the implementations verify has already been called when we settle
  // const verifyResponse = await verify(client, payload, paymentRequirements);
  // if (!verifyResponse.isValid) {
  //   return {
  //     success: false,
  //     errorReason: verifyResponse.invalidReason,
  //     network: payload.network,
  //     transaction: (payload.payload as ExactSuiPayload).transaction,
  //   };
  // }

  let payer: string | undefined;

  try {
    // Decode the transaction
    const suiPayload = payload.payload as ExactSuiPayload;
    const transactionBytes = fromBase64(suiPayload.transaction);
    payer = Transaction.from(transactionBytes).getData().sender!;

    // Execute the transaction
    const result = await client.executeTransactionBlock({
      transactionBlock: transactionBytes,
      signature: suiPayload.signature,
      options: {
        showEffects: true,
        showBalanceChanges: true,
      },
    });

    if (!result.effects) {
      throw new Error("settle_exact_sui_transaction_execution_failed");
    }

    if (!result.balanceChanges) {
      throw new Error("settle_exact_sui_transaction_balance_changes_not_found");
    }

    // Verify the balance changes match the requirements
    verifyEffectsAndBalanceChanges(
      result.effects,
      result.balanceChanges,
      paymentRequirements,
      "settle_exact_sui",
    );

    return {
      success: true,
      errorReason: undefined,
      payer,
      transaction: result.digest,
      network: payload.network,
    };
  } catch (error) {
    // if the error is one of the known error reasons, return the error reason
    if (error instanceof Error) {
      if (ErrorReasons.includes(error.message as (typeof ErrorReasons)[number])) {
        return {
          success: false,
          errorReason: error.message as (typeof ErrorReasons)[number],
          payer,
          transaction: (payload.payload as ExactSuiPayload).transaction,
          network: payload.network,
        };
      }
    }

    // if the error is not one of the known error reasons, return an unexpected error reason
    console.error("Settle error:", error);
    return {
      success: false,
      errorReason: "unexpected_settle_error",
      payer: payer ?? "",
      transaction: (payload.payload as ExactSuiPayload).transaction,
      network: payload.network,
    };
  }
}
