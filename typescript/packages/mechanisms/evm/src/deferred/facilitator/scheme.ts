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
  DeferredDepositPayload,
  DeferredVoucherPayload,
  DeferredClaimPayload,
  DeferredSettleActionPayload,
  DeferredDepositSettlePayload,
  isDeferredDepositPayload,
  isDeferredVoucherPayload,
  isDeferredClaimPayload,
  isDeferredSettleActionPayload,
  isDeferredDepositSettlePayload,
} from "../types";
import { verifyDeposit, settleDeposit } from "./deposit";
import { verifyVoucher } from "./voucher";
import { executeClaim } from "./claim";
import { executeSettle } from "./settle";
import * as Errors from "./errors";

/**
 * EVM facilitator implementation for the Deferred payment scheme.
 * Routes verify/settle to deposit, voucher, claim, or settle handlers
 * based on payload discriminators.
 */
export class DeferredEvmScheme implements SchemeNetworkFacilitator {
  readonly scheme = "deferred";
  readonly caipFamily = "eip155:*";

  /**
   * Creates the deferred facilitator using the given EVM signer.
   *
   * @param signer - The EVM signer used for facilitator contract operations.
   */
  constructor(private readonly signer: FacilitatorEvmSigner) {}

  /**
   * Returns optional extra metadata for a network; deferred uses none.
   *
   * @param _ - The network identifier (unused for this scheme).
   * @returns Always undefined; deferred scheme does not attach extra metadata here.
   */
  getExtra(_: string): Record<string, unknown> | undefined {
    return undefined;
  }

  /**
   * Returns facilitator signer addresses for the given network.
   *
   * @param _ - The network identifier (unused for this scheme).
   * @returns Addresses returned by the facilitator signer.
   */
  getSigners(_: string): string[] {
    return [...this.signer.getAddresses()];
  }

  /**
   * Verifies a deferred payment payload (deposit or voucher).
   *
   * Deposit verification uses local checks, typed-data signature verification, and a single Multicall3
   * batch for escrow or balance reads; it does not simulate `receiveWithAuthorization` onchain or apply
   * EIP-6492 factory deployment beyond what `FacilitatorEvmSigner.verifyTypedData` already supports.
   *
   * @param payload - The payment payload to verify.
   * @param requirements - The payment requirements to verify against.
   * @param _ - Optional facilitator context (unused).
   * @returns Verification result indicating validity and payer or error reason.
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _?: FacilitatorContext,
  ): Promise<VerifyResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;

    if (payload.accepted.scheme !== "deferred" || requirements.scheme !== "deferred") {
      return { isValid: false, invalidReason: Errors.ErrInvalidScheme };
    }

    if (payload.accepted.network !== requirements.network) {
      return { isValid: false, invalidReason: Errors.ErrNetworkMismatch };
    }

    if (isDeferredDepositPayload(rawPayload)) {
      return verifyDeposit(this.signer, rawPayload as DeferredDepositPayload, requirements);
    }

    if (isDeferredVoucherPayload(rawPayload)) {
      return verifyVoucher(this.signer, rawPayload as DeferredVoucherPayload, requirements);
    }

    return { isValid: false, invalidReason: Errors.ErrInvalidPayloadType };
  }

  /**
   * Settles a deferred payment (deposit, claim, settle action, or deposit-only settle).
   *
   * @param payload - The payment payload to settle.
   * @param requirements - The payment requirements to settle against.
   * @param _ - Optional facilitator context (unused).
   * @returns Settlement result including transaction hash and network.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    _?: FacilitatorContext,
  ): Promise<SettleResponse> {
    const rawPayload = payload.payload as Record<string, unknown>;

    if (isDeferredDepositPayload(rawPayload)) {
      return settleDeposit(this.signer, rawPayload as DeferredDepositPayload, requirements);
    }

    if (isDeferredDepositSettlePayload(rawPayload)) {
      const dsPayload = rawPayload as unknown as DeferredDepositSettlePayload;
      const depositPayload = {
        type: "deposit" as const,
        deposit: dsPayload.deposit,
        voucher: undefined as never,
      } as unknown as DeferredDepositPayload;
      return settleDeposit(this.signer, depositPayload, requirements);
    }

    if (isDeferredClaimPayload(rawPayload)) {
      return executeClaim(this.signer, rawPayload as unknown as DeferredClaimPayload, requirements);
    }

    if (isDeferredSettleActionPayload(rawPayload)) {
      return executeSettle(
        this.signer,
        rawPayload as unknown as DeferredSettleActionPayload,
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
