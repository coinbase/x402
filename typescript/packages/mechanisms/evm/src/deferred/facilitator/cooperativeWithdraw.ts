import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { DeferredCooperativeWithdrawSettlePayload } from "../types";
import { deferredEscrowABI } from "../abi";
import { DEFERRED_ESCROW_ADDRESS } from "../constants";
import * as Errors from "./errors";

/**
 * Claims outstanding vouchers (if any) then executes cooperativeWithdraw on-chain.
 * Returns the cooperativeWithdraw transaction hash on success.
 *
 * @param signer - The facilitator EVM signer.
 * @param payload - Cooperative withdraw settle payload with claims and requests.
 * @param requirements - Payment requirements (network).
 * @returns Settlement outcome with the cooperativeWithdraw transaction hash.
 */
export async function executeCooperativeWithdraw(
  signer: FacilitatorEvmSigner,
  payload: DeferredCooperativeWithdrawSettlePayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;

  try {
    if (payload.claims.length > 0) {
      const claimArgs = payload.claims.map(c => ({
        payer: getAddress(c.payer),
        cumulativeAmount: BigInt(c.cumulativeAmount),
        claimAmount: BigInt(c.claimAmount),
        nonce: BigInt(c.nonce),
        signature: c.signature,
      }));

      const claimTx = await signer.writeContract({
        address: getAddress(DEFERRED_ESCROW_ADDRESS),
        abi: deferredEscrowABI,
        functionName: "claim",
        args: [payload.serviceId, claimArgs],
      });

      const claimReceipt = await signer.waitForTransactionReceipt({ hash: claimTx });
      if (claimReceipt.status !== "success") {
        return {
          success: false,
          errorReason: Errors.ErrClaimTransactionFailed,
          transaction: claimTx,
          network,
        };
      }
    }

    const withdrawArgs = payload.requests.map(r => ({
      payer: getAddress(r.payer),
      authorizerSignature: r.authorizerSignature,
    }));

    const tx = await signer.writeContract({
      address: getAddress(DEFERRED_ESCROW_ADDRESS),
      abi: deferredEscrowABI,
      functionName: "cooperativeWithdraw",
      args: [payload.serviceId, withdrawArgs],
    });

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrCooperativeWithdrawTransactionFailed,
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
      errorReason: Errors.ErrCooperativeWithdrawTransactionFailed,
      transaction: "",
      network,
    };
  }
}
