import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import {
  SchemeNetworkClient,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
  SettleResponse,
} from "@x402/core/types";
import { getAddress, recoverTypedDataAddress } from "viem";
import { ClientEvmSigner } from "../../signer";
import { deferredEscrowABI } from "../abi";
import { DEFERRED_ESCROW_ADDRESS, DEFERRED_ESCROW_DOMAIN, voucherTypes } from "../constants";
import { DeferredVoucherPayload } from "../types";
import { getEvmChainId } from "../../utils";
import { createDeferredEIP3009DepositPayload } from "./eip3009";
import { ClientSessionStorage, InMemoryClientSessionStorage } from "./storage";
import type { DeferredClientContext } from "./storage";
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
  /**
   * When true (default), if the next voucher `cumulativeAmount` would exceed the session’s `deposit`,
   * the client sends a `deposit` payload (top-up) using the same sizing as the initial deposit ({@link depositMultiplier} / {@link maxDeposit}).
   */
  autoTopUp?: boolean;
}

export interface DeferredEvmSchemeOptions {
  depositPolicy?: DeferredDepositPolicy;
  storage?: ClientSessionStorage;
}

export type { DeferredClientContext } from "./storage";

/**
 * Whether `o` is full {@link DeferredEvmSchemeOptions} (not only {@link DeferredDepositPolicy}).
 *
 * @param o - Scheme options, deposit policy only, or undefined.
 * @returns True when `o` has `storage` or `depositPolicy` keys.
 */
function isDeferredEvmSchemeOptions(
  o: DeferredEvmSchemeOptions | DeferredDepositPolicy | undefined,
): o is DeferredEvmSchemeOptions {
  return o !== undefined && typeof o === "object" && ("storage" in o || "depositPolicy" in o);
}

/**
 * Normalizes the constructor's optional second argument into storage and deposit policy.
 *
 * @param second - Full options, bare deposit policy, or undefined for defaults.
 * @returns Resolved `storage` and optional `depositPolicy`.
 */
function resolveClientOptions(second?: DeferredEvmSchemeOptions | DeferredDepositPolicy): {
  depositPolicy?: DeferredDepositPolicy;
  storage: ClientSessionStorage;
} {
  if (second === undefined) {
    return { storage: new InMemoryClientSessionStorage() };
  }
  if (isDeferredEvmSchemeOptions(second)) {
    return {
      storage: second.storage ?? new InMemoryClientSessionStorage(),
      depositPolicy: second.depositPolicy,
    };
  }
  return {
    storage: new InMemoryClientSessionStorage(),
    depositPolicy: second,
  };
}

/**
 * EVM client implementation for the Deferred payment scheme.
 * Creates deposit+voucher or voucher-only payloads using session state updated via
 * {@link DeferredEvmScheme.processPaymentResponse}.
 */
export class DeferredEvmScheme implements SchemeNetworkClient {
  readonly scheme = "deferred";

  private readonly storage: ClientSessionStorage;
  private readonly depositPolicy: DeferredDepositPolicy | undefined;
  private pendingWithdraw = new Set<string>();

  /** Last `serviceId` from {@link createPaymentPayload}; used when settle `extra` omits `serviceId` (e.g. deposit tx). */
  private lastPaymentServiceId: string | undefined;

  /**
   * Creates the deferred client scheme with the given signer.
   *
   * @param signer - The client EVM signer.
   * @param optionsOrPolicy - Optional {@link DeferredEvmSchemeOptions}, or for backward compatibility a bare {@link DeferredDepositPolicy}.
   */
  constructor(
    private readonly signer: ClientEvmSigner,
    optionsOrPolicy?: DeferredEvmSchemeOptions | DeferredDepositPolicy,
  ) {
    const { storage, depositPolicy } = resolveClientOptions(optionsOrPolicy);
    this.storage = storage;
    this.depositPolicy = depositPolicy;

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
  async processPaymentResponse(
    getHeader: (name: string) => string | null | undefined,
  ): Promise<void> {
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

    if (extra.cooperativeWithdraw === true) {
      await this.storage.delete(key);
      return;
    }

    const prev = await this.storage.get(key);
    const next: DeferredClientContext = { ...(prev ?? {}) };

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

    await this.storage.set(key, next);
  }

  /**
   * Marks a service for cooperative withdraw: the next voucher payload
   * for this service will include `withdraw: true`. The flag is cleared
   * after {@link createPaymentPayload} consumes it.
   *
   * @param serviceId - The on-chain service id to request a withdraw for.
   */
  requestCooperativeWithdraw(serviceId: string): void {
    this.pendingWithdraw.add(serviceId.toLowerCase());
  }

  /**
   * Reads on-chain subchannel state and seeds session storage with a conservative baseline
   * (`chargedCumulativeAmount = totalClaimed`, `lastNonce = on-chain nonce`).
   *
   * @param serviceId - Deferred escrow service id.
   * @param _network - x402 network (e.g. `eip155:8453`); reserved for future chain-specific reads.
   * @returns The restored client context.
   */
  async recoverSession(serviceId: `0x${string}`, _network: string): Promise<DeferredClientContext> {
    void _network;
    if (!this.signer.readContract) {
      throw new Error(
        "recoverSession requires ClientEvmSigner.readContract (e.g. toClientEvmSigner(account, publicClient))",
      );
    }

    const sub = (await this.signer.readContract({
      address: DEFERRED_ESCROW_ADDRESS,
      abi: deferredEscrowABI,
      functionName: "getSubchannel",
      args: [serviceId, getAddress(this.signer.address)],
    })) as {
      deposit: bigint;
      totalClaimed: bigint;
      nonce: bigint;
      withdrawRequestedAt: bigint;
    };

    void sub.withdrawRequestedAt;

    const depositStr = sub.deposit.toString();
    const totalClaimedStr = sub.totalClaimed.toString();
    const ctx: DeferredClientContext = {
      chargedCumulativeAmount: totalClaimedStr,
      lastNonce: Number(sub.nonce),
      currentDeposit: depositStr,
      totalClaimed: totalClaimedStr,
    };

    await this.storage.set(this.sessionKey(serviceId), ctx);
    return ctx;
  }

  /**
   * Returns true if a session exists for this service and signer.
   *
   * @param serviceId - `PaymentRequirements.extra.serviceId`.
   * @returns True when session storage has an entry for this service.
   */
  async hasSession(serviceId: string): Promise<boolean> {
    return (await this.storage.get(this.sessionKey(serviceId))) !== undefined;
  }

  /**
   * Returns persisted session context if any.
   *
   * @param serviceId - `PaymentRequirements.extra.serviceId`.
   * @returns Stored context, or undefined when none.
   */
  async getSession(serviceId: string): Promise<DeferredClientContext | undefined> {
    return this.storage.get(this.sessionKey(serviceId));
  }

  /**
   * Handles a corrective 402 (`error === "deferred_stale_cumulative_amount"`): verifies EIP-712 voucher data from
   * `accepts[].extra` and updates session storage when valid.
   *
   * @param paymentRequired - Parsed 402 JSON body.
   * @returns True when session was updated from verified corrective data.
   */
  async processCorrectivePaymentRequired(paymentRequired: PaymentRequired): Promise<boolean> {
    if (paymentRequired.error !== "deferred_stale_cumulative_amount") {
      return false;
    }

    const accept = paymentRequired.accepts.find(
      a =>
        a.scheme === "deferred" &&
        a.extra?.chargedCumulativeAmount !== undefined &&
        a.extra?.signedCumulativeAmount !== undefined &&
        a.extra?.nonce !== undefined &&
        a.extra?.signature !== undefined &&
        typeof a.extra.serviceId === "string",
    );
    if (!accept?.extra) {
      return false;
    }

    const ex = accept.extra;
    const serviceId = ex.serviceId as `0x${string}`;
    const chargedRaw = ex.chargedCumulativeAmount;
    const signedRaw = ex.signedCumulativeAmount;
    const nonceRaw = ex.nonce;
    const sig = ex.signature as `0x${string}`;

    const charged = BigInt(String(chargedRaw));
    const signed = BigInt(String(signedRaw));
    const nonce =
      typeof nonceRaw === "bigint"
        ? nonceRaw
        : BigInt(typeof nonceRaw === "number" ? nonceRaw : String(nonceRaw));

    if (charged > signed) {
      return false;
    }

    if (!this.signer.readContract) {
      return false;
    }

    let sub: { deposit: bigint; totalClaimed: bigint; nonce: bigint };
    try {
      sub = (await this.signer.readContract({
        address: DEFERRED_ESCROW_ADDRESS,
        abi: deferredEscrowABI,
        functionName: "getSubchannel",
        args: [serviceId, getAddress(this.signer.address)],
      })) as { deposit: bigint; totalClaimed: bigint; nonce: bigint };
    } catch {
      return false;
    }
    const onChainClaimed = sub.totalClaimed;
    if (charged < onChainClaimed) {
      return false;
    }

    const chainId = getEvmChainId(accept.network);
    const recovered = await recoverTypedDataAddress({
      domain: {
        ...DEFERRED_ESCROW_DOMAIN,
        chainId,
        verifyingContract: getAddress(DEFERRED_ESCROW_ADDRESS),
      },
      types: voucherTypes,
      primaryType: "Voucher",
      message: {
        serviceId,
        payer: getAddress(this.signer.address),
        cumulativeAmount: signed,
        nonce,
      },
      signature: sig,
    });

    if (recovered.toLowerCase() !== this.signer.address.toLowerCase()) {
      return false;
    }

    const ctx: DeferredClientContext = {
      chargedCumulativeAmount: charged.toString(),
      signedCumulativeAmount: signed.toString(),
      signature: sig,
      lastNonce: Number(nonce),
      currentDeposit: sub.deposit.toString(),
      totalClaimed: sub.totalClaimed.toString(),
    };

    await this.storage.set(this.sessionKey(serviceId), ctx);
    return true;
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

    const key = this.sessionKey(serviceId);
    let deferredCtx = await this.storage.get(key);
    if (deferredCtx === undefined && this.signer.readContract) {
      deferredCtx = await this.recoverSession(serviceId, paymentRequirements.network);
    }
    deferredCtx = deferredCtx ?? {};

    const needsInitialDeposit = !deferredCtx.currentDeposit || deferredCtx.currentDeposit === "0";

    const baseCumulative = BigInt(deferredCtx.chargedCumulativeAmount ?? "0");
    const requestAmount = BigInt(paymentRequirements.amount);
    const cumulativeAmount = (baseCumulative + requestAmount).toString();
    const voucherNonce = (deferredCtx.lastNonce ?? 0) + 1;

    const autoTopUp = this.depositPolicy?.autoTopUp !== false;
    const currentDep = BigInt(deferredCtx.currentDeposit ?? "0");
    const needsTopUp = autoTopUp && !needsInitialDeposit && BigInt(cumulativeAmount) > currentDep;

    if (needsInitialDeposit || needsTopUp) {
      const depositAmount = needsInitialDeposit
        ? (deferredCtx.depositAmount ?? this.depositAmountForRequest(requestAmount))
        : this.depositAmountForRequest(requestAmount);
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

    const shouldWithdraw = this.pendingWithdraw.has(serviceId.toLowerCase());
    if (shouldWithdraw) {
      this.pendingWithdraw.delete(serviceId.toLowerCase());
    }

    const payload: DeferredVoucherPayload = {
      type: "voucher",
      ...voucher,
      ...(shouldWithdraw ? { withdraw: true } : {}),
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

  /**
   * `min(depositMultiplier * requestAmount, maxDeposit)` with scheme defaults.
   *
   * @param requestAmount - Payment amount for this request (atomic units).
   * @returns Deposit string in atomic units after applying multiplier and cap.
   */
  private depositAmountForRequest(requestAmount: bigint): string {
    const mult = BigInt(this.depositPolicy?.depositMultiplier ?? 10);
    let depositBig = mult * requestAmount;
    const cap = this.depositPolicy?.maxDeposit;
    if (cap !== undefined) {
      const capBig = BigInt(cap);
      if (depositBig > capBig) depositBig = capBig;
    }
    return depositBig.toString();
  }
}
