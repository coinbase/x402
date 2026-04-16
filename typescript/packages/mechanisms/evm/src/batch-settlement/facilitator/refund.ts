import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { encodeFunctionData, getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import type {
  AuthorizerSigner,
  BatchSettlementRefundWithSignaturePayload,
  ChannelState,
} from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import { computeChannelId } from "../utils";
import { signClaimBatch, signRefund } from "../authorizerSigner";
import * as Errors from "./errors";
import { buildVoucherClaimArgs } from "./claim";
import { readChannelState } from "./utils";

/**
 * Builds `responseExtra` fields for a refund settlement after applying the refund amount to channel state.
 *
 * @param payload - Refund payload containing claims, amount, and optional prior `responseExtra`.
 * @param channelId - Canonical channel id for the refund.
 * @param preState - On-chain channel state before this refund, or null if unknown.
 * @returns Extra fields for the settlement response.
 */
function buildRefundExtra(
  payload: BatchSettlementRefundWithSignaturePayload,
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
 * @returns Arguments object suitable for `refundWithSignature` on the settlement contract.
 */
function buildConfigTuple(config: BatchSettlementRefundWithSignaturePayload["config"]) {
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
 * Executes a cooperative refund via `refundWithSignature`.
 *
 * When `refundAuthorizerSignature` / `claimAuthorizerSignature` are present they are used
 * directly.  When absent the facilitator signs the missing digests using
 * `authorizerSigner`, after verifying that `config.receiverAuthorizer` matches
 * `authorizerSigner.address`.
 *
 * If `payload.claims` is non-empty, the claim and refund are batched atomically via
 * the contract's `multicall`.
 *
 * @param signer - Facilitator signer used to submit the on-chain transactions.
 * @param payload - Refund payload with optional signatures, amount, and nonce.
 * @param requirements - Payment requirements for network identification.
 * @param authorizerSigner - Dedicated key for producing EIP-712 signatures.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeRefundWithSignature(
  signer: FacilitatorEvmSigner,
  payload: BatchSettlementRefundWithSignaturePayload,
  requirements: PaymentRequirements,
  authorizerSigner: AuthorizerSigner,
): Promise<SettleResponse> {
  const network = requirements.network;

  try {
    const channelId = computeChannelId(payload.config);
    const preState = await readChannelState(signer, channelId);
    const contractAddr = getAddress(BATCH_SETTLEMENT_ADDRESS);

    let refundSig = payload.refundAuthorizerSignature;
    if (!refundSig) {
      if (getAddress(payload.config.receiverAuthorizer) !== getAddress(authorizerSigner.address)) {
        return {
          success: false,
          errorReason: Errors.ErrAuthorizerAddressMismatch,
          transaction: "",
          network,
        };
      }
      refundSig = await signRefund(
        authorizerSigner,
        channelId,
        payload.amount,
        payload.nonce,
        network,
      );
    }

    const refundCalldata = encodeFunctionData({
      abi: batchSettlementABI,
      functionName: "refundWithSignature",
      args: [
        buildConfigTuple(payload.config),
        BigInt(payload.amount),
        BigInt(payload.nonce),
        refundSig,
      ],
    });

    let tx: `0x${string}`;

    if (payload.claims.length > 0) {
      let claimSig = payload.claimAuthorizerSignature;
      if (!claimSig) {
        claimSig = await signClaimBatch(authorizerSigner, payload.claims, network);
      }

      const claimCalldata = encodeFunctionData({
        abi: batchSettlementABI,
        functionName: "claimWithSignature",
        args: [buildVoucherClaimArgs(payload.claims), claimSig],
      });

      try {
        await signer.readContract({
          address: contractAddr,
          abi: batchSettlementABI,
          functionName: "multicall",
          args: [[claimCalldata, refundCalldata]],
        });
      } catch {
        return {
          success: false,
          errorReason: Errors.ErrRefundSimulationFailed,
          transaction: "",
          network,
        };
      }

      tx = await signer.writeContract({
        address: contractAddr,
        abi: batchSettlementABI,
        functionName: "multicall",
        args: [[claimCalldata, refundCalldata]],
      });
    } else {
      try {
        await signer.readContract({
          address: contractAddr,
          abi: batchSettlementABI,
          functionName: "refundWithSignature",
          args: [
            buildConfigTuple(payload.config),
            BigInt(payload.amount),
            BigInt(payload.nonce),
            refundSig,
          ],
        });
      } catch {
        return {
          success: false,
          errorReason: Errors.ErrRefundSimulationFailed,
          transaction: "",
          network,
        };
      }

      tx = await signer.writeContract({
        address: contractAddr,
        abi: batchSettlementABI,
        functionName: "refundWithSignature",
        args: [
          buildConfigTuple(payload.config),
          BigInt(payload.amount),
          BigInt(payload.nonce),
          refundSig,
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
