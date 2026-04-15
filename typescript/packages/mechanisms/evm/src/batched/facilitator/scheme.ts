import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import {
  BatchedDepositPayload,
  BatchedVoucherPayload,
  BatchedClaimPayload,
  BatchedClaimWithSignaturePayload,
  BatchedSettleActionPayload,
  BatchedDepositSettlePayload,
  BatchedCooperativeWithdrawPayload,
  BatchedCooperativeWithdrawWithSignaturePayload,
  isBatchedDepositPayload,
  isBatchedVoucherPayload,
  isBatchedClaimPayload,
  isBatchedClaimWithSignaturePayload,
  isBatchedSettleActionPayload,
  isBatchedDepositSettlePayload,
  isBatchedCooperativeWithdrawPayload,
  isBatchedCooperativeWithdrawWithSignaturePayload,
} from "../types";
import { verifyDeposit, settleDeposit } from "./deposit";
import { verifyVoucher } from "./voucher";
import { executeClaim, executeClaimWithSignature } from "./claim";
import { executeSettle } from "./settle";
import {
  executeCooperativeWithdraw,
  executeCooperativeWithdrawWithSignature,
} from "./cooperativeWithdraw";
import * as Errors from "./errors";

/**
 * Facilitator-side implementation of the `batched` scheme for EVM networks.
 *
 * Routes incoming verify/settle requests to the appropriate handler based on payload
 * type (deposit, voucher, claim, claimWithSignature, settle, cooperativeWithdraw).
 */
export class BatchedEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "batched";
  readonly caipFamily = "eip155:*";

  /**
   * Creates a facilitator scheme for verifying and settling batched payments.
   *
   * @param signer - Facilitator EVM signer used for on-chain reads, writes, and signature verification.
   */
  constructor(private readonly signer: FacilitatorEvmSigner) {}

  /**
   * Returns facilitator-specific extra fields to be merged into payment requirements.
   *
   * Exposes the facilitator's first signer address as `receiverAuthorizer` so the
   * server and client can embed it in `ChannelConfig`.
   *
   * @param _ - Network identifier (unused).
   * @returns Extra fields containing `receiverAuthorizer`, or undefined if no addresses configured.
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    const addresses = this.signer.getAddresses();
    const receiverAuthorizer = addresses[0];
    if (!receiverAuthorizer) return undefined;
    return { receiverAuthorizer };
  }

  /**
   * Returns all facilitator signer addresses available for the given network.
   *
   * @param _ - Network identifier (unused).
   * @returns Array of hex addresses.
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a payment payload (deposit or voucher) without executing settlement.
   *
   * - Deposit payloads: validates ERC-3009 authorization + voucher signature + on-chain state.
   * - Voucher payloads: validates cumulative voucher signature + on-chain channel balance.
   *
   * @param payload - The x402 payment payload envelope.
   * @param requirements - Server payment requirements (scheme, network, asset, amount).
   * @param _ - Optional facilitator context (unused).
   * @returns A {@link VerifyResponse} indicating validity with payer and channel state in `extra`.
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;

    if (payload.accepted.scheme !== "batched" || requirements.scheme !== "batched") {
      return { isValid: false, invalidReason: Errors.ErrInvalidScheme };
    }

    if (payload.accepted.network !== requirements.network) {
      return { isValid: false, invalidReason: Errors.ErrNetworkMismatch };
    }

    if (isBatchedDepositPayload(rawPayload)) {
      return verifyDeposit(this.signer, rawPayload as BatchedDepositPayload, requirements);
    }

    if (isBatchedVoucherPayload(rawPayload)) {
      const voucherPayload = rawPayload as unknown as BatchedVoucherPayload;
      return verifyVoucher(this.signer, voucherPayload, requirements, voucherPayload.channelConfig);
    }

    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType };
  }

  /**
   * Executes settlement for a payment payload.
   *
   * Dispatches to the correct handler based on payload settle action:
   * - `deposit` → on-chain `depositWithERC3009`
   * - `claim` → on-chain `claim(VoucherClaim[])`
   * - `claimWithSignature` → on-chain `claimWithSignature(VoucherClaim[], bytes)`
   * - `settle` → on-chain `settle(receiver, token)`
   * - `cooperativeWithdraw` → optional claim + onchain `cooperativeWithdraw` (msg.sender-gated)
   * - `cooperativeWithdrawWithSignature` → optional claim + onchain `cooperativeWithdrawWithSignature`
   *
   * @param payload - The x402 payment payload envelope.
   * @param requirements - Server payment requirements.
   * @param _ - Optional facilitator context (unused).
   * @returns A {@link SettleResponse} with the transaction hash on success.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;

    if (isBatchedDepositPayload(rawPayload)) {
      return settleDeposit(this.signer, rawPayload as BatchedDepositPayload, requirements);
    }

    if (isBatchedDepositSettlePayload(rawPayload)) {
      const dsPayload = rawPayload as unknown as BatchedDepositSettlePayload;
      const depositPayload = {
        type: "deposit" as const,
        deposit: dsPayload.deposit,
        voucher: undefined as never,
      } as unknown as BatchedDepositPayload;
      return settleDeposit(this.signer, depositPayload, requirements);
    }

    if (isBatchedClaimPayload(rawPayload)) {
      return executeClaim(this.signer, rawPayload as unknown as BatchedClaimPayload, requirements);
    }

    if (isBatchedClaimWithSignaturePayload(rawPayload)) {
      return executeClaimWithSignature(
        this.signer,
        rawPayload as unknown as BatchedClaimWithSignaturePayload,
        requirements,
      );
    }

    if (isBatchedCooperativeWithdrawWithSignaturePayload(rawPayload)) {
      return executeCooperativeWithdrawWithSignature(
        this.signer,
        rawPayload as unknown as BatchedCooperativeWithdrawWithSignaturePayload,
        requirements,
      );
    }

    if (isBatchedCooperativeWithdrawPayload(rawPayload)) {
      return executeCooperativeWithdraw(
        this.signer,
        rawPayload as unknown as BatchedCooperativeWithdrawPayload,
        requirements,
      );
    }

    if (isBatchedSettleActionPayload(rawPayload)) {
      return executeSettle(
        this.signer,
        rawPayload as unknown as BatchedSettleActionPayload,
        requirements,
      );
    }

    return {
      success: false,
      errorReason: Errors.ErrInvalidPayloadType,
      transaction: "",
      network: requirements.network,
    };
  }
}
