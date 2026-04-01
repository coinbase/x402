import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { DeferredClaimPayload } from "../types";
import { deferredEscrowABI } from "../abi";
import { DEFERRED_ESCROW_ADDRESS } from "../constants";
import * as Errors from "./errors";

/**
 * Executes a batch claim on the escrow contract.
 * Submits claim(serviceId, VoucherClaim[]) to validate voucher signatures
 * and update subchannel accounting on-chain.
 *
 * @param signer - The facilitator EVM signer.
 * @param payload - The claim payload with service id and voucher claims.
 * @param requirements - Payment requirements (network and billed `amount` for this settlement).
 * @returns Settlement outcome with transaction hash or error reason.
 */
export async function executeClaim(
  signer: FacilitatorEvmSigner,
  payload: DeferredClaimPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;
  const claimArgs = payload.claims.map(c => ({
    payer: getAddress(c.payer),
    cumulativeAmount: BigInt(c.cumulativeAmount),
    claimAmount: BigInt(c.claimAmount),
    nonce: BigInt(c.nonce),
    signature: c.signature,
  }));

  try {
    const tx = await signer.writeContract({
      address: getAddress(DEFERRED_ESCROW_ADDRESS),
      abi: deferredEscrowABI,
      functionName: "claim",
      args: [payload.serviceId, claimArgs],
    });

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrClaimTransactionFailed,
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
      errorReason: Errors.ErrClaimTransactionFailed,
      transaction: "",
      network,
    };
  }
}
