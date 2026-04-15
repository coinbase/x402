import { PaymentRequirements, VerifyResponse } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { BatchedVoucherPayload, ChannelConfig } from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import { getEvmChainId } from "../../utils";
import { multicall } from "../../multicall";
import * as Errors from "./errors";
import { validateChannelConfig, verifyBatchedVoucherTypedData } from "./utils";

/**
 * Verifies a cumulative voucher payload against on-chain channel state.
 *
 * Checks that:
 * 1. The voucher signature is valid (ECDSA or ERC-1271 depending on `payerAuthorizer`).
 * 2. The token in the channel config matches the payment requirements asset.
 * 3. The channel exists on-chain with a non-zero balance.
 * 4. The `maxClaimableAmount` does not exceed the channel's deposited balance.
 * 5. The `maxClaimableAmount` is greater than what has already been claimed.
 *
 * @param signer - Facilitator signer used for on-chain reads and signature verification.
 * @param payload - The voucher payload (channelId, maxClaimableAmount, signature).
 * @param requirements - Server payment requirements (asset, network, amount).
 * @param channelConfig - Reconstructed channel configuration for the payer/receiver pair.
 * @returns A {@link VerifyResponse} indicating validity and returning channel state in `extra`.
 */
export async function verifyVoucher(
  signer: FacilitatorEvmSigner,
  payload: BatchedVoucherPayload,
  requirements: PaymentRequirements,
  channelConfig: ChannelConfig,
): Promise<VerifyResponse> {
  const channelId = payload.channelId;
  const chainId = getEvmChainId(requirements.network);

  const configErr = validateChannelConfig(channelConfig, channelId, requirements);
  if (configErr) {
    return { isValid: false, invalidReason: configErr, payer: channelConfig.payer };
  }

  const voucherOk = await verifyBatchedVoucherTypedData(
    signer,
    {
      channelId,
      maxClaimableAmount: payload.maxClaimableAmount,
      payerAuthorizer: channelConfig.payerAuthorizer,
      payer: channelConfig.payer,
      signature: payload.signature,
    },
    chainId,
  );
  if (!voucherOk) {
    return {
      isValid: false,
      invalidReason: Errors.ErrInvalidVoucherSignature,
      payer: channelConfig.payer,
    };
  }

  const mcResults = await multicall(signer.readContract.bind(signer), [
    {
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "channels",
      args: [channelId],
    },
    {
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "pendingWithdrawals",
      args: [channelId],
    },
    {
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "refundNonce",
      args: [channelId],
    },
  ]);

  const [chRes, wdRes, rnRes] = mcResults;
  if (chRes.status === "failure" || wdRes.status === "failure" || rnRes.status === "failure") {
    return { isValid: false, invalidReason: Errors.ErrChannelNotFound, payer: channelConfig.payer };
  }

  const [chBalance, chTotalClaimed] = chRes.result as [bigint, bigint];
  const [, wdInitiatedAt] = wdRes.result as [bigint, bigint];
  const refundNonceVal = rnRes.result as bigint;

  if (chBalance === 0n) {
    return { isValid: false, invalidReason: Errors.ErrChannelNotFound, payer: channelConfig.payer };
  }

  const maxClaimableAmount = BigInt(payload.maxClaimableAmount);

  if (maxClaimableAmount > chBalance) {
    return {
      isValid: false,
      invalidReason: Errors.ErrCumulativeExceedsBalance,
      payer: channelConfig.payer,
    };
  }

  if (maxClaimableAmount <= chTotalClaimed) {
    return {
      isValid: false,
      invalidReason: Errors.ErrCumulativeAmountBelowClaimed,
      payer: channelConfig.payer,
    };
  }

  return {
    isValid: true,
    payer: channelConfig.payer,
    extra: {
      channelId,
      balance: chBalance.toString(),
      totalClaimed: chTotalClaimed.toString(),
      withdrawRequestedAt: Number(wdInitiatedAt),
      refundNonce: refundNonceVal.toString(),
    },
  };
}
