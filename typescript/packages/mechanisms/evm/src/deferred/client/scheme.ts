import { decodePaymentResponseHeader } from "@x402/core/http";
import {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
  SettleResponse,
} from "@x402/core/types";
import { ClientEvmSigner } from "../../signer";
import { DeferredVoucherPayload } from "../types";
import { createDeferredEIP3009DepositPayload } from "./eip3009";
import { signVoucher } from "./voucher";

/**
 * Optional rules for sizing the onchain deposit when the client sends a `deposit` payload.
 *
 * Default deposit is `10 * paymentRequirements.amount` (see {@link DeferredDepositPolicy.depositMultiplier}).
 */
export interface DeferredDepositPolicy {
  /**
   * Integer multiplier on `paymentRequirements.amount` (default 10). Must be >= 1.
   */
  depositMultiplier?: number;
  /**
   * Optional maximum deposit in token smallest units.
   * The signed deposit becomes `min(depositMultiplier * amount, maxDeposit)` when set.
   * If that is less than the voucher `cumulativeAmount` for the request, facilitation will reject the payload.
   */
  maxDeposit?: string;
}

export interface DeferredClientContext {
  /** Current cumulative amount charged by the server for this subchannel */
  chargedCumulativeAmount?: string;
  /** Last nonce used in this subchannel */
  lastNonce?: number;
  /** Current deposit amount on-chain for this subchannel */
  currentDeposit?: string;
  /** Total claimed on-chain */
  totalClaimed?: string;
  /** Amount to deposit (only for deposit payloads) */
  depositAmount?: string;
}

/**
 * EVM client implementation for the Deferred payment scheme.
 * Creates deposit+voucher or voucher-only payloads using session state updated via
 * {@link DeferredEvmScheme.processPaymentResponse}.
 */
export class DeferredEvmScheme implements SchemeNetworkClient {
  readonly scheme = "deferred";

  private sessions = new Map<string, DeferredClientContext>();

  /** Last `serviceId` from {@link createPaymentPayload}; used when settle `extra` omits `serviceId` (e.g. deposit tx). */
  private lastPaymentServiceId: string | undefined;

  /**
   * Creates the deferred client scheme with the given signer.
   *
   * @param signer - The client EVM signer.
   * @param depositPolicy - Optional deposit sizing; ignored when {@link DeferredClientContext.depositAmount} is set for the session.
   */
  constructor(
    private readonly signer: ClientEvmSigner,
    private readonly depositPolicy?: DeferredDepositPolicy,
  ) {
    if (depositPolicy) {
      const m = depositPolicy.depositMultiplier;
      if (m !== undefined && (!Number.isInteger(m) || m < 1)) {
        throw new Error("depositMultiplier must be an integer >= 1");
      }
      if (depositPolicy.maxDeposit !== undefined) {
        try {
          if (BigInt(depositPolicy.maxDeposit) < 0n) {
            throw new Error("maxDeposit must be a non-negative integer string");
          }
        } catch {
          throw new Error("maxDeposit must be a non-negative integer string");
        }
      }
    }
  }

  /**
   * Parses `PAYMENT-RESPONSE` from a settled HTTP response and
   * updates internal subchannel session state for the next `createPaymentPayload` call.
   *
   * @param getHeader - Resolves a response header value by name (case-insensitive).
   */
  processPaymentResponse(getHeader: (name: string) => string | null | undefined): void {
    const raw = getHeader("PAYMENT-RESPONSE");
    if (!raw) return;

    let settle: SettleResponse;
    try {
      settle = decodePaymentResponseHeader(raw);
    } catch {
      return;
    }

    const extra = settle.extra ?? {};
    let serviceId: string | undefined =
      typeof extra.serviceId === "string" && extra.serviceId ? extra.serviceId : undefined;
    if (
      !serviceId &&
      (extra.deposit !== undefined || extra.totalClaimed !== undefined) &&
      this.lastPaymentServiceId
    ) {
      serviceId = this.lastPaymentServiceId;
    }
    if (!serviceId) return;

    const key = this.sessionKey(serviceId);
    const next: DeferredClientContext = { ...(this.sessions.get(key) ?? {}) };

    if (extra.chargedCumulativeAmount !== undefined) {
      next.chargedCumulativeAmount = String(extra.chargedCumulativeAmount);
    }
    if (extra.nonce !== undefined) {
      next.lastNonce = Number(extra.nonce);
    }
    if (extra.deposit !== undefined) {
      next.currentDeposit = String(extra.deposit);
    }
    if (extra.totalClaimed !== undefined) {
      next.totalClaimed = String(extra.totalClaimed);
    }

    this.sessions.set(key, next);
  }

  /**
   * Builds a deposit+voucher or voucher-only payload from requirements and internal session state.
   *
   * @param x402Version - The x402 protocol version for the payload envelope.
   * @param paymentRequirements - Server-issued requirements including `serviceId` in `extra`.
   * @param _context - Unused; deferred session is managed via {@link processPaymentResponse}.
   * @returns The payment payload result for the client to submit.
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    void _context;

    const serviceId = paymentRequirements.extra?.serviceId as `0x${string}`;
    if (!serviceId) {
      throw new Error("Missing serviceId in paymentRequirements.extra");
    }

    this.lastPaymentServiceId = serviceId;

    const deferredCtx = this.sessions.get(this.sessionKey(serviceId)) ?? {};
    const needsDeposit = !deferredCtx.currentDeposit || deferredCtx.currentDeposit === "0";

    const baseCumulative = BigInt(deferredCtx.chargedCumulativeAmount ?? "0");
    const requestAmount = BigInt(paymentRequirements.amount);
    const cumulativeAmount = (baseCumulative + requestAmount).toString();
    const voucherNonce = (deferredCtx.lastNonce ?? 0) + 1;

    if (needsDeposit) {
      const depositAmount =
        deferredCtx.depositAmount ??
        (() => {
          const mult = BigInt(this.depositPolicy?.depositMultiplier ?? 10);
          let depositBig = mult * requestAmount;
          const cap = this.depositPolicy?.maxDeposit;
          if (cap !== undefined) {
            const capBig = BigInt(cap);
            if (depositBig > capBig) depositBig = capBig;
          }
          return depositBig.toString();
        })();
      return createDeferredEIP3009DepositPayload(
        this.signer,
        x402Version,
        paymentRequirements,
        depositAmount,
        cumulativeAmount,
        voucherNonce,
      );
    }

    const voucher = await signVoucher(
      this.signer,
      serviceId,
      cumulativeAmount,
      voucherNonce,
      paymentRequirements.network,
    );

    const payload: DeferredVoucherPayload = {
      type: "voucher",
      ...voucher,
    };

    return {
      x402Version,
      payload,
    };
  }

  /**
   * Stable map key for a (serviceId, signer) subchannel session.
   *
   * @param serviceId - The service identifier from payment requirements or settle extra.
   * @returns Lowercased composite key for the internal session map.
   */
  private sessionKey(serviceId: string): string {
    return `${serviceId.toLowerCase()}:${this.signer.address.toLowerCase()}`;
  }
}
