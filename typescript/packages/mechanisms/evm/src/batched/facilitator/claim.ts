import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { BatchedClaimPayload, BatchedClaimWithSignaturePayload } from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import * as Errors from "./errors";

/**
 * Converts an array of {@link BatchedVoucherClaim} into the on-chain tuple format
 * expected by the contract's `claim()` and `claimWithSignature()` functions.
 *
 * @param claims - Typed voucher claims with channel config, amounts, and signatures.
 * @returns Contract-ready VoucherClaim argument array.
 */
function buildVoucherClaimArgs(claims: BatchedClaimPayload["claims"]) {
  return claims.map(c => ({
    voucher: {
      channel: {
        payer: getAddress(c.voucher.channel.payer),
        payerAuthorizer: getAddress(c.voucher.channel.payerAuthorizer),
        receiver: getAddress(c.voucher.channel.receiver),
        receiverAuthorizer: getAddress(c.voucher.channel.receiverAuthorizer),
        token: getAddress(c.voucher.channel.token),
        withdrawDelay: c.voucher.channel.withdrawDelay,
        salt: c.voucher.channel.salt,
      },
      maxClaimableAmount: BigInt(c.voucher.maxClaimableAmount),
    },
    signature: c.signature,
    claimAmount: BigInt(c.claimAmount),
  }));
}

/**
 * Submits a batch claim to the on-chain `claim()` function (self-claim path).
 *
 * The caller (facilitator) must be the receiver or have on-chain approval.
 *
 * @param signer - Facilitator signer used to submit the claim transaction.
 * @param payload - Claim payload containing one or more voucher claims.
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeClaim(
  signer: FacilitatorEvmSigner,
  payload: BatchedClaimPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;
  const claimArgs = buildVoucherClaimArgs(payload.claims);

  try {
    const tx = await signer.writeContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "claim",
      args: [claimArgs],
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

/**
 * Submits a batch claim with a receiver-authorizer signature via `claimWithSignature()`.
 *
 * This path is used when a third party (not the receiver) submits the claim on behalf
 * of the receiver, authorised by an off-chain EIP-712 `ClaimBatch` signature from the
 * `receiverAuthorizer`.
 *
 * @param signer - Facilitator signer used to submit the claim transaction.
 * @param payload - Claim payload containing voucher claims and the authorizer's signature.
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeClaimWithSignature(
  signer: FacilitatorEvmSigner,
  payload: BatchedClaimWithSignaturePayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;
  const claimArgs = buildVoucherClaimArgs(payload.claims);

  try {
    const tx = await signer.writeContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "claimWithSignature",
      args: [claimArgs, payload.authorizerSignature],
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
