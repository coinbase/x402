import {
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkFacilitator,
  FacilitatorContext,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { FacilitatorEvmSigner } from "../../signer";
import { BATCH_SETTLEMENT_SCHEME } from "../constants";
import {
  BatchSettlementDepositPayload,
  BatchSettlementVoucherPayload,
  BatchSettlementClaimPayload,
  BatchSettlementClaimWithSignaturePayload,
  BatchSettlementSettleActionPayload,
  BatchSettlementDepositSettlePayload,
  BatchSettlementRefundPayload,
  BatchSettlementRefundWithSignaturePayload,
  isBatchSettlementDepositPayload,
  isBatchSettlementVoucherPayload,
  isBatchSettlementClaimPayload,
  isBatchSettlementClaimWithSignaturePayload,
  isBatchSettlementSettleActionPayload,
  isBatchSettlementDepositSettlePayload,
  isBatchSettlementRefundPayload,
  isBatchSettlementRefundWithSignaturePayload,
} from "../types";
import { verifyDeposit, settleDeposit } from "./deposit";
import { verifyVoucher } from "./voucher";
import { executeClaim, executeClaimWithSignature } from "./claim";
import { executeSettle } from "./settle";
import { executeRefund, executeRefundWithSignature } from "./refund";
import * as Errors from "./errors";

/**
 * Facilitator-side implementation of the `batched` scheme for EVM networks.
 *
 * Routes incoming verify/settle requests to the appropriate handler based on payload
 * type (deposit, voucher, claim, claimWithSignature, settle, refund).
 */
export class BatchSettlementEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = BATCH_SETTLEMENT_SCHEME;
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

    if (
      payload.accepted.scheme !== BATCH_SETTLEMENT_SCHEME ||
      requirements.scheme !== BATCH_SETTLEMENT_SCHEME
    ) {
      return { isValid: false, invalidReason: Errors.ErrInvalidScheme };
    }

    if (payload.accepted.network !== requirements.network) {
      return { isValid: false, invalidReason: Errors.ErrNetworkMismatch };
    }

    if (isBatchSettlementDepositPayload(rawPayload)) {
      return verifyDeposit(this.signer, rawPayload as BatchSettlementDepositPayload, requirements);
    }

    if (isBatchSettlementVoucherPayload(rawPayload)) {
      const voucherPayload = rawPayload as unknown as BatchSettlementVoucherPayload;
      return verifyVoucher(this.signer, voucherPayload, requirements, voucherPayload.channelConfig);
    }

    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType };
  }

  /**
   * Executes settlement for a payment payload.
   *
   * Dispatches to the correct handler based on payload settle action:
   * - `deposit` → on-chain `deposit(config, amount, collector, collectorData)`
   * - `claim` → on-chain `claim(VoucherClaim[])`
   * - `claimWithSignature` → on-chain `claimWithSignature(VoucherClaim[], bytes)`
   * - `settle` → on-chain `settle(receiver, token)`
   * - `refund` → optional claim + onchain `refund(config, amount)` (msg.sender-gated)
   * - `refundWithSignature` → optional claim + onchain `refundWithSignature(config, amount, nonce, sig)`
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

    if (isBatchSettlementDepositPayload(rawPayload)) {
      return settleDeposit(this.signer, rawPayload as BatchSettlementDepositPayload, requirements);
    }

    if (isBatchSettlementDepositSettlePayload(rawPayload)) {
      const dsPayload = rawPayload as unknown as BatchSettlementDepositSettlePayload;
      const depositPayload = {
        type: "deposit" as const,
        deposit: dsPayload.deposit,
        voucher: undefined as never,
      } as unknown as BatchSettlementDepositPayload;
      return settleDeposit(this.signer, depositPayload, requirements);
    }

    if (isBatchSettlementClaimPayload(rawPayload)) {
      return executeClaim(
        this.signer,
        rawPayload as unknown as BatchSettlementClaimPayload,
        requirements,
      );
    }

    if (isBatchSettlementClaimWithSignaturePayload(rawPayload)) {
      return executeClaimWithSignature(
        this.signer,
        rawPayload as unknown as BatchSettlementClaimWithSignaturePayload,
        requirements,
      );
    }

    if (isBatchSettlementRefundWithSignaturePayload(rawPayload)) {
      return executeRefundWithSignature(
        this.signer,
        rawPayload as unknown as BatchSettlementRefundWithSignaturePayload,
        requirements,
      );
    }

    if (isBatchSettlementRefundPayload(rawPayload)) {
      return executeRefund(
        this.signer,
        rawPayload as unknown as BatchSettlementRefundPayload,
        requirements,
      );
    }

    if (isBatchSettlementSettleActionPayload(rawPayload)) {
      return executeSettle(
        this.signer,
        rawPayload as unknown as BatchSettlementSettleActionPayload,
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
