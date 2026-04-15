import { SettleResponse, PaymentRequirements } from "@x402/core/types";
import { getAddress } from "viem";
import { FacilitatorEvmSigner } from "../../signer";
import {
  BatchedCooperativeWithdrawPayload,
  BatchedCooperativeWithdrawWithSignaturePayload,
} from "../types";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS } from "../constants";
import * as Errors from "./errors";
import { executeClaim, executeClaimWithSignature } from "./claim";

/**
 * Normalizes channel config fields to checksummed addresses for the batch settlement contract.
 *
 * @param config - Channel configuration from the cooperative withdraw payload.
 * @returns Arguments object suitable for `cooperativeWithdraw` on the settlement contract.
 */
function buildConfigTuple(config: BatchedCooperativeWithdrawPayload["config"]) {
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
 * Executes a cooperative withdrawal via msg.sender path (facilitator IS the receiverAuthorizer).
 *
 * If `payload.claims` is non-empty, outstanding vouchers are claimed first via
 * {@link executeClaim}.  Then the channel balance is returned to the payer through
 * `cooperativeWithdraw(config)`.
 *
 * @param signer - Facilitator signer used to submit the on-chain transactions.
 * @param payload - Cooperative withdraw payload (ChannelConfig + claims, no signature).
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeCooperativeWithdraw(
  signer: FacilitatorEvmSigner,
  payload: BatchedCooperativeWithdrawPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;

  try {
    if (payload.claims.length > 0) {
      const claimResult = await executeClaim(
        signer,
        { settleAction: "claim", claims: payload.claims },
        requirements,
      );
      if (!claimResult.success) {
        return claimResult;
      }
    }

    const tx = await signer.writeContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "cooperativeWithdraw",
      args: [buildConfigTuple(payload.config)],
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

/**
 * Executes a cooperative withdrawal via signature path (server IS the receiverAuthorizer).
 *
 * If `payload.claims` is non-empty:
 * - If `claimAuthorizerSignature` is present, uses `claimWithSignature`
 * - Otherwise, falls back to msg.sender-gated `claim`
 *
 * Then calls `cooperativeWithdrawWithSignature(config, receiverAuthorizerSignature)`.
 *
 * @param signer - Facilitator signer used to submit the on-chain transactions.
 * @param payload - Cooperative withdraw payload with receiverAuthorizer signature.
 * @param requirements - Payment requirements for network identification.
 * @returns A {@link SettleResponse} with the transaction hash on success.
 */
export async function executeCooperativeWithdrawWithSignature(
  signer: FacilitatorEvmSigner,
  payload: BatchedCooperativeWithdrawWithSignaturePayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  const network = requirements.network;

  try {
    if (payload.claims.length > 0) {
      if (payload.claimAuthorizerSignature) {
        const claimResult = await executeClaimWithSignature(
          signer,
          {
            settleAction: "claimWithSignature",
            claims: payload.claims,
            authorizerSignature: payload.claimAuthorizerSignature,
          },
          requirements,
        );
        if (!claimResult.success) {
          return claimResult;
        }
      } else {
        const claimResult = await executeClaim(
          signer,
          { settleAction: "claim", claims: payload.claims },
          requirements,
        );
        if (!claimResult.success) {
          return claimResult;
        }
      }
    }

    const tx = await signer.writeContract({
      address: getAddress(BATCH_SETTLEMENT_ADDRESS),
      abi: batchSettlementABI,
      functionName: "cooperativeWithdrawWithSignature",
      args: [buildConfigTuple(payload.config), payload.receiverAuthorizerSignature],
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
