import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { encodeFunctionData, getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import { BatchedRefundPayload, BatchedRefundWithSignaturePayload, ChannelState } from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import { computeChannelId } from "../utils";
import * as Errors from "./errors";
import { buildVoucherClaimArgs } from "./claim";
import { readChannelState } from "./utils";

/**
 * Builds `responseExtra` fields for a refund settlement after applying the refund amount to channel state.
 *
 * @param payload - Refund payload containing claims, amount, and optional prior `responseExtra`.
 * @param channelId - Canonical channel id for the refund.
 * @param preState - On-chain channel state before this refund, or null if unknown.
 * @returns Extra fields (`channelId`, balances, `totalClaimed`, `refundNonce`, etc.) for the settlement response.
 */
function buildRefundExtra(
  payload: BatchedRefundPayload | BatchedRefundWithSignaturePayload,
  channelId: `0x${string}`,
  preState: ChannelState | null,
): Record<string, unknown> {
  const preTotalClaimed = preState?.totalClaimed ?? 0n;
  const preBalance = preState?.balance ?? 0n;

  const lastClaimTotal =
    payload.claims.length > 0
      ? BigInt(payload.claims[payload.claims.length - 1].totalClaimed)
      : preTotalClaimed;
  const postClaimTotalClaimed = lastClaimTotal > preTotalClaimed ? lastClaimTotal : preTotalClaimed;

  const available = preBalance - postClaimTotalClaimed;
  const requestedAmount = BigInt(payload.amount);
  const actualRefund = requestedAmount > available ? available : requestedAmount;

  return {
    channelId,
    chargedCumulativeAmount: payload.responseExtra?.chargedCumulativeAmount ?? "0",
    balance: (preBalance - actualRefund).toString(),
    totalClaimed: postClaimTotalClaimed.toString(),
    withdrawRequestedAt: 0,
    refundNonce: String((preState?.refundNonce ?? 0n) + 1n),
  };
}

/**
 * Normalizes channel config fields to checksummed addresses for the batch settlement contract.
 *
 * @param config - Channel configuration from the refund payload.
 * @returns Arguments object suitable for `refund` on the settlement contract.
 */
function buildConfigTuple(config: BatchedRefundPayload["config"]) {
  return {
    payer: getAddress(config.payer),
    payerAuthorizer: getAddress(config.payerAuthorizer),
    receiver: getAddress(config.receiver),
    receiverAuthorizer: getAddress(config.receiverAuthorizer),
    token: getAddress(config.token),
    withdrawDelay: config.withdrawDelay,
    salt: config.salt,
  };
}

/**
 * Executes a cooperative refund via msg.sender path (facilitator IS the receiverAuthorizer or receiver).
 *
 * If `payload.claims` is non-empty, outstanding vouchers are claimed atomically with the
 * refund via the contract's `multicall`. Otherwise, a single `refund` call is made.
 *
 * @param signer - Facilitator signer used to submit the on-chain transactions.
 * @param payload - Refund payload (ChannelConfig + amount + claims, no signature).
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeRefund(
  signer: FacilitatorEvmSigner,
  payload: BatchedRefundPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;

  try {
    const channelId = computeChannelId(payload.config);
    const preState = await readChannelState(signer, channelId);
    const contractAddr = getAddress(BATCH_SETTLEMENT_ADDRESS);

    const refundCalldata = encodeFunctionData({
      abi: batchSettlementABI,
      functionName: "refund",
      args: [buildConfigTuple(payload.config), BigInt(payload.amount)],
    });

    let tx: `0x${string}`;

    if (payload.claims.length > 0) {
      const claimCalldata = encodeFunctionData({
        abi: batchSettlementABI,
        functionName: "claim",
        args: [buildVoucherClaimArgs(payload.claims)],
      });

      tx = await signer.writeContract({
        address: contractAddr,
        abi: batchSettlementABI,
        functionName: "multicall",
        args: [[claimCalldata, refundCalldata]],
      });
    } else {
      tx = await signer.writeContract({
        address: contractAddr,
        abi: batchSettlementABI,
        functionName: "refund",
        args: [buildConfigTuple(payload.config), BigInt(payload.amount)],
      });
    }

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrRefundTransactionFailed,
        transaction: tx,
        network,
      };
    }

    return {
      success: true,
      transaction: tx,
      network,
      payer: payload.config.payer,
      amount: requirements.amount,
      extra: buildRefundExtra(payload, channelId, preState),
    };
  } catch {
    return {
      success: false,
      errorReason: Errors.ErrRefundTransactionFailed,
      transaction: "",
      network,
    };
  }
}

/**
 * Executes a cooperative refund via signature path (server IS the receiverAuthorizer).
 *
 * If `payload.claims` is non-empty, the claim and refund are batched atomically via
 * the contract's `multicall`. The claim variant is chosen based on whether
 * `claimAuthorizerSignature` is present (`claimWithSignature`) or absent (`claim`).
 *
 * @param signer - Facilitator signer used to submit the on-chain transactions.
 * @param payload - Refund payload with receiverAuthorizer signature, amount, and nonce.
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeRefundWithSignature(
  signer: FacilitatorEvmSigner,
  payload: BatchedRefundWithSignaturePayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;

  try {
    const channelId = computeChannelId(payload.config);
    const preState = await readChannelState(signer, channelId);
    const contractAddr = getAddress(BATCH_SETTLEMENT_ADDRESS);

    const refundCalldata = encodeFunctionData({
      abi: batchSettlementABI,
      functionName: "refundWithSignature",
      args: [
        buildConfigTuple(payload.config),
        BigInt(payload.amount),
        BigInt(payload.nonce),
        payload.receiverAuthorizerSignature,
      ],
    });

    let tx: `0x${string}`;

    if (payload.claims.length > 0) {
      const claimCalldata = payload.claimAuthorizerSignature
        ? encodeFunctionData({
            abi: batchSettlementABI,
            functionName: "claimWithSignature",
            args: [buildVoucherClaimArgs(payload.claims), payload.claimAuthorizerSignature],
          })
        : encodeFunctionData({
            abi: batchSettlementABI,
            functionName: "claim",
            args: [buildVoucherClaimArgs(payload.claims)],
          });

      tx = await signer.writeContract({
        address: contractAddr,
        abi: batchSettlementABI,
        functionName: "multicall",
        args: [[claimCalldata, refundCalldata]],
      });
    } else {
      tx = await signer.writeContract({
        address: contractAddr,
        abi: batchSettlementABI,
        functionName: "refundWithSignature",
        args: [
          buildConfigTuple(payload.config),
          BigInt(payload.amount),
          BigInt(payload.nonce),
          payload.receiverAuthorizerSignature,
        ],
      });
    }

    const receipt = await signer.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: Errors.ErrRefundTransactionFailed,
        transaction: tx,
        network,
      };
    }

    return {
      success: true,
      transaction: tx,
      network,
      payer: payload.config.payer,
      amount: requirements.amount,
      extra: buildRefundExtra(payload, channelId, preState),
    };
  } catch {
    return {
      success: false,
      errorReason: Errors.ErrRefundTransactionFailed,
      transaction: "",
      network,
    };
  }
}
