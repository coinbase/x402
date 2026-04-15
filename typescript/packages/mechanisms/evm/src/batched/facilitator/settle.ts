import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { BatchedSettleActionPayload } from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import * as Errors from "./errors";

/**
 * Transfers claimed funds from the contract.
 *
 * This should be called after one or more `claim()` transactions have updated the
 * receiver's `totalClaimed` accounting on-chain.
 *
 * @param signer - Facilitator signer used to submit the settlement transaction.
 * @param payload - Settle payload containing the receiver address and token address.
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeSettle(
  signer: FacilitatorEvmSigner,
  payload: BatchedSettleActionPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;
  try {
    const tx = await signer.writeContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "settle",
      args: [getAddress(payload.receiver), getAddress(payload.token)],
    });

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrSettleTransactionFailed,
        transaction: tx,
        network,
      };
    }

    return {
      success: true,
      transaction: tx,
      network,
      amount: requirements.amount,
    };
  } catch {
    return {
      success: false,
      errorReason: Errors.ErrSettleTransactionFailed,
      transaction: "",
      network,
    };
  }
}
