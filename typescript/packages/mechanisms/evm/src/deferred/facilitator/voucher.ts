import { PaymentRequirements, VerifyResponse } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { DeferredVoucherPayload, ChannelConfig } from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import { getEvmChainId } from "../../utils";
import * as Errors from "./errors";
import { validateChannelConfig, verifyDeferredVoucherTypedData } from "./utils";

type ChannelState = {
  balance: bigint;
  totalClaimed: bigint;
};

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
  payload: DeferredVoucherPayload,
  requirements: PaymentRequirements,
  channelConfig: ChannelConfig,
): Promise<VerifyResponse> {
  const channelId = payload.channelId;
  const chainId = getEvmChainId(requirements.network);

  const configErr = validateChannelConfig(channelConfig, channelId, requirements);
  if (configErr) {
    return { isValid: false, invalidReason: configErr, payer: channelConfig.payer };
  }

  const voucherOk = await verifyDeferredVoucherTypedData(
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

  if (getAddress(channelConfig.token) !== getAddress(requirements.asset)) {
    return { isValid: false, invalidReason: Errors.ErrTokenMismatch, payer: channelConfig.payer };
  }

  let channel: ChannelState;
  try {
    channel = (await signer.readContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "getChannel",
      args: [channelId],
    })) as ChannelState;
  } catch {
    return { isValid: false, invalidReason: Errors.ErrChannelNotFound, payer: channelConfig.payer };
  }

  if (channel.balance === 0n) {
    return { isValid: false, invalidReason: Errors.ErrChannelNotFound, payer: channelConfig.payer };
  }

  const maxClaimableAmount = BigInt(payload.maxClaimableAmount);

  if (maxClaimableAmount > channel.balance) {
    return {
      isValid: false,
      invalidReason: Errors.ErrCumulativeExceedsBalance,
      payer: channelConfig.payer,
    };
  }

  if (maxClaimableAmount <= channel.totalClaimed) {
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
      balance: channel.balance.toString(),
      totalClaimed: channel.totalClaimed.toString(),
      withdrawRequestedAt: 0,
    },
  };
}
