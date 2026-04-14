import { decodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import {
  SchemeNetworkClient,
  SchemeClientHooks,
  PaymentRequirements,
  PaymentPayloadResult,
  PaymentPayloadContext,
  SettleResponse,
} from "@x402/core/types";
import { getAddress, recoverTypedDataAddress } from "viem";
import { ClientEvmSigner } from "../../signer";
import { batchSettlementABI } from "../abi";
import { BATCH_SETTLEMENT_ADDRESS, BATCH_SETTLEMENT_DOMAIN, voucherTypes } from "../constants";
import { ChannelConfig, DeferredVoucherPayload } from "../types";
import { getEvmChainId } from "../../utils";
import { createDeferredEIP3009DepositPayload } from "./eip3009";
import { ClientSessionStorage, InMemoryClientSessionStorage } from "./storage";
import type { DeferredClientContext } from "./storage";
import { signVoucher } from "./voucher";
import { computeChannelId } from "../utils";

export interface DeferredDepositPolicy {
  depositMultiplier?: number;
  maxDeposit?: string;
  autoTopUp?: boolean;
}

export interface DeferredEvmSchemeOptions {
  depositPolicy?: DeferredDepositPolicy;
  storage?: ClientSessionStorage;
  salt?: `0x${string}`;
  payerAuthorizer?: `0x${string}`;
  /** When set, EIP-712 vouchers are signed with this key; deposits still use the main `signer`. */
  voucherSigner?: ClientEvmSigner;
}

export type { DeferredClientContext } from "./storage";

/**
 * Discriminates a full options object from a bare deposit-policy object.
 *
 * @param o - Constructor argument that may be options, deposit policy only, or undefined.
 * @returns `true` when `o` is a {@link DeferredEvmSchemeOptions} object.
 */
function isDeferredEvmSchemeOptions(
  o: DeferredEvmSchemeOptions | DeferredDepositPolicy | undefined,
): o is DeferredEvmSchemeOptions {
  return (
    o !== undefined &&
    typeof o === "object" &&
    ("storage" in o ||
      "depositPolicy" in o ||
      "salt" in o ||
      "payerAuthorizer" in o ||
      "voucherSigner" in o)
  );
}

/**
 * Normalises the constructor's second argument into a uniform options shape.
 *
 * @param second - Optional second constructor argument (options or deposit policy).
 * @returns Resolved storage, salt, deposit policy, and optional payer authorizer.
 */
function resolveClientOptions(second?: DeferredEvmSchemeOptions | DeferredDepositPolicy): {
  depositPolicy?: DeferredDepositPolicy;
  storage: ClientSessionStorage;
  salt: `0x${string}`;
  payerAuthorizer?: `0x${string}`;
  voucherSigner?: ClientEvmSigner;
} {
  const defaultSalt =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  if (second === undefined) {
    return { storage: new InMemoryClientSessionStorage(), salt: defaultSalt };
  }
  if (isDeferredEvmSchemeOptions(second)) {
    return {
      storage: second.storage ?? new InMemoryClientSessionStorage(),
      depositPolicy: second.depositPolicy,
      salt: second.salt ?? defaultSalt,
      payerAuthorizer: second.payerAuthorizer,
      voucherSigner: second.voucherSigner,
    };
  }
  return {
    storage: new InMemoryClientSessionStorage(),
    depositPolicy: second,
    salt: defaultSalt,
  };
}

/**
 * Client-side implementation of the `batch-settlement` scheme for EVM networks.
 *
 * Builds payment payloads (deposit + voucher or voucher-only), processes server responses
 * to update local session state, handles corrective 402 resynchronisation, and supports
 * on-demand cooperative withdrawal requests.
 */
export class DeferredEvmScheme implements SchemeNetworkClient {
  readonly scheme = "batch-settlement";

  readonly schemeHooks: SchemeClientHooks = {

    onPaymentResponse: async ctx => {
      if (ctx.settleResponse) {
        await this.processSettleResponse(ctx.settleResponse);
        return;
      }

      if (ctx.paymentRequired) {
        const ok = await this.processCorrectivePaymentRequired(ctx.paymentRequired);
        return ok ? { recovered: true } : undefined;
      }
    },
  };

  private readonly storage: ClientSessionStorage;
  private readonly depositPolicy: DeferredDepositPolicy | undefined;
  private readonly salt: `0x${string}`;
  private readonly payerAuthorizer: `0x${string}` | undefined;
  private readonly voucherSigner: ClientEvmSigner | undefined;
  private pendingWithdraw = new Set<string>();

  /**
   * Constructs a batch-settlement client scheme.
   *
   * @param signer - Client EVM wallet used for signing vouchers and ERC-3009 authorizations.
   * @param optionsOrPolicy - Either a full options object or a bare deposit-policy.
   */
  constructor(
    private readonly signer: ClientEvmSigner,
    optionsOrPolicy?: DeferredEvmSchemeOptions | DeferredDepositPolicy,
  ) {
    const { storage, depositPolicy, salt, payerAuthorizer, voucherSigner } =
      resolveClientOptions(optionsOrPolicy);
    this.storage = storage;
    this.depositPolicy = depositPolicy;
    this.salt = salt;
    this.payerAuthorizer = payerAuthorizer;
    this.voucherSigner = voucherSigner;

    if (
      payerAuthorizer !== undefined &&
      voucherSigner !== undefined &&
      getAddress(payerAuthorizer) !== getAddress(voucherSigner.address)
    ) {
      throw new Error("payerAuthorizer address must match voucherSigner.address");
    }

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
   * Constructs the immutable {@link ChannelConfig} from payment requirements and client
   * settings (signer address, salt, payerAuthorizer).
   *
   * @param paymentRequirements - Server payment requirements providing receiver, asset, and extra fields.
   * @returns The ChannelConfig that uniquely identifies this payment channel.
   */
  buildChannelConfig(paymentRequirements: PaymentRequirements): ChannelConfig {
    const extra = paymentRequirements.extra as Record<string, unknown> | undefined;
    return {
      payer: this.signer.address,
      payerAuthorizer: getAddress(
        this.payerAuthorizer ?? this.voucherSigner?.address ?? this.signer.address,
      ),
      receiver: paymentRequirements.payTo as `0x${string}`,
      receiverAuthorizer:
        (extra?.receiverAuthorizer as `0x${string}`) ??
        ("0x0000000000000000000000000000000000000000" as `0x${string}`),
      token: paymentRequirements.asset as `0x${string}`,
      withdrawDelay: typeof extra?.withdrawDelay === "number" ? extra.withdrawDelay : 900,
      salt: this.salt,
    };
  }

  /**
   * Processes the `PAYMENT-RESPONSE` header after a successful request.
   *
   * Decodes the header into a `SettleResponse` and delegates to `processSettleResponse`.
   * Kept as public API for manual / advanced use.
   *
   * @param getHeader - Function to retrieve a response header by name.
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

    await this.processSettleResponse(settle);
  }

  /**
   * Updates local session state from a parsed `SettleResponse`.
   *
   * Updates chargedCumulativeAmount, balance, and totalClaimed, or
   * deletes the session if the response indicates a cooperative withdrawal.
   *
   * @param settle - The parsed settle response.
   */
  async processSettleResponse(settle: SettleResponse): Promise<void> {
    const extra = settle.extra ?? {};
    const channelId =
      typeof extra.channelId === "string" && extra.channelId ? extra.channelId : undefined;
    if (!channelId) return;

    const key = channelId.toLowerCase();

    if (extra.cooperativeWithdraw === true) {
      await this.storage.delete(key);
      return;
    }

    const prev = await this.storage.get(key);
    const next: DeferredClientContext = { ...(prev ?? {}) };

    if (extra.chargedCumulativeAmount !== undefined) {
      next.chargedCumulativeAmount = String(extra.chargedCumulativeAmount);
    }
    if (extra.balance !== undefined) {
      next.balance = String(extra.balance);
    }
    if (extra.totalClaimed !== undefined) {
      next.totalClaimed = String(extra.totalClaimed);
    }

    await this.storage.set(key, next);
  }

  /**
   * Flags a channel for cooperative withdrawal on the next voucher request.
   *
   * @param channelId - The channel to request withdrawal for.
   */
  requestCooperativeWithdraw(channelId: string): void {
    this.pendingWithdraw.add(channelId.toLowerCase());
  }

  /**
   * Recovers a channel session from on-chain state (useful after a cold start or session loss).
   *
   * @param paymentRequirements - Server payment requirements used to derive the ChannelConfig.
   * @returns The recovered client context.
   */
  async recoverSession(paymentRequirements: PaymentRequirements): Promise<DeferredClientContext> {
    if (!this.signer.readContract) {
      throw new Error("recoverSession requires ClientEvmSigner.readContract");
    }

    const config = this.buildChannelConfig(paymentRequirements);
    const channelId = computeChannelId(config);

    const [chBalance, chTotalClaimed] = (await this.signer.readContract({
      address: BATCH_SETTLEMENT_ADDRESS,
      abi: batchSettlementABI,
      functionName: "channels",
      args: [channelId],
    })) as [bigint, bigint];

    const balanceStr = chBalance.toString();
    const totalClaimedStr = chTotalClaimed.toString();
    const ctx: DeferredClientContext = {
      chargedCumulativeAmount: totalClaimedStr,
      balance: balanceStr,
      totalClaimed: totalClaimedStr,
    };

    await this.storage.set(channelId.toLowerCase(), ctx);
    return ctx;
  }

  /**
   * Returns whether a local session exists for the given channel.
   *
   * @param channelId - The channel identifier to check.
   * @returns `true` when a session is stored for the channel.
   */
  async hasSession(channelId: string): Promise<boolean> {
    return (await this.storage.get(channelId.toLowerCase())) !== undefined;
  }

  /**
   * Returns the local session context for a channel, if present.
   *
   * @param channelId - The channel identifier.
   * @returns Stored context or `undefined`.
   */
  async getSession(channelId: string): Promise<DeferredClientContext | undefined> {
    return this.storage.get(channelId.toLowerCase());
  }

  /**
   * Handles a corrective 402 response from the server when the client's cumulative base
   * is out of sync.
   *
   * Validates the server-provided state (chargedCumulativeAmount, signedMaxClaimable,
   * signature) against on-chain data and the client's own signing key, then updates the
   * local session if everything checks out.
   *
   * @param paymentRequired - The decoded 402 response body.
   * @returns `true` if the session was successfully resynced and the request can be retried.
   */
  async processCorrectivePaymentRequired(paymentRequired: PaymentRequired): Promise<boolean> {
    if (paymentRequired.error !== "batch_settlement_stale_cumulative_amount") {
      return false;
    }

    const accept = paymentRequired.accepts.find(
      a =>
        a.scheme === "batch-settlement" &&
        a.extra?.chargedCumulativeAmount !== undefined &&
        a.extra?.signedMaxClaimable !== undefined &&
        a.extra?.signature !== undefined,
    );
    if (!accept?.extra) {
      return false;
    }

    const ex = accept.extra;
    const chargedRaw = ex.chargedCumulativeAmount;
    const signedRaw = ex.signedMaxClaimable;
    const sig = ex.signature as `0x${string}`;

    const charged = BigInt(String(chargedRaw));
    const signed = BigInt(String(signedRaw));

    if (charged > signed) {
      return false;
    }

    const config = this.buildChannelConfig(accept);
    const channelId = computeChannelId(config);

    if (!this.signer.readContract) {
      return false;
    }

    let chBalance: bigint;
    let chTotalClaimed: bigint;
    try {
      const [balance, totalClaimed] = (await this.signer.readContract({
        address: BATCH_SETTLEMENT_ADDRESS,
        abi: batchSettlementABI,
        functionName: "channels",
        args: [channelId],
      })) as [bigint, bigint];
      chBalance = balance;
      chTotalClaimed = totalClaimed;
    } catch {
      return false;
    }

    if (charged < chTotalClaimed) {
      return false;
    }

    const chainId = getEvmChainId(accept.network);
    const recovered = await recoverTypedDataAddress({
      domain: {
        ...BATCH_SETTLEMENT_DOMAIN,
        chainId,
        verifyingContract: getAddress(BATCH_SETTLEMENT_ADDRESS),
      },
      types: voucherTypes,
      primaryType: "Voucher",
      message: {
        channelId,
        maxClaimableAmount: signed,
      },
      signature: sig,
    });

    const expectedSigner = getAddress(
      this.payerAuthorizer ?? this.voucherSigner?.address ?? this.signer.address,
    );
    if (recovered.toLowerCase() !== expectedSigner.toLowerCase()) {
      return false;
    }

    const ctx: DeferredClientContext = {
      chargedCumulativeAmount: charged.toString(),
      signedMaxClaimable: signed.toString(),
      signature: sig,
      balance: chBalance.toString(),
      totalClaimed: chTotalClaimed.toString(),
    };

    await this.storage.set(channelId.toLowerCase(), ctx);
    return true;
  }

  /**
   * Creates the payment payload for a batch-settlement request.
   *
   * If the channel has no on-chain deposit (or needs a top-up), builds an ERC-3009 deposit
   * payload bundled with a voucher.  Otherwise, signs and returns a voucher-only payload.
   * If a cooperative withdrawal has been requested for this channel, the `withdraw` flag
   * is set on the voucher so the server initiates the on-chain withdrawal.
   *
   * @param x402Version - Protocol version for the payload envelope.
   * @param paymentRequirements - Server payment requirements (scheme, network, asset, amount).
   * @param _context - Optional payment payload context (unused).
   * @returns A {@link PaymentPayloadResult} ready to be sent as the `X-PAYMENT` header.
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    void _context;

    const config = this.buildChannelConfig(paymentRequirements);
    const channelId = computeChannelId(config);
    const key = channelId.toLowerCase();

    let deferredCtx = await this.storage.get(key);
    if (deferredCtx === undefined && this.signer.readContract) {
      deferredCtx = await this.recoverSession(paymentRequirements);
    }
    deferredCtx = deferredCtx ?? {};

    const needsInitialDeposit = !deferredCtx.balance || deferredCtx.balance === "0";

    const baseCumulative = BigInt(deferredCtx.chargedCumulativeAmount ?? "0");
    const requestAmount = BigInt(paymentRequirements.amount);
    const maxClaimableAmount = (baseCumulative + requestAmount).toString();

    const autoTopUp = this.depositPolicy?.autoTopUp !== false;
    const currentBalance = BigInt(deferredCtx.balance ?? "0");
    const needsTopUp =
      autoTopUp && !needsInitialDeposit && BigInt(maxClaimableAmount) > currentBalance;

    if (needsInitialDeposit || needsTopUp) {
      const depositAmount = needsInitialDeposit
        ? (deferredCtx.depositAmount ?? this.depositAmountForRequest(requestAmount))
        : this.depositAmountForRequest(requestAmount);
      return createDeferredEIP3009DepositPayload(
        this.signer,
        x402Version,
        paymentRequirements,
        config,
        depositAmount,
        maxClaimableAmount,
        this.voucherSigner,
      );
    }

    const voucherSigner = this.voucherSigner ?? this.signer;
    const voucher = await signVoucher(
      voucherSigner,
      channelId,
      maxClaimableAmount,
      paymentRequirements.network,
    );

    const shouldWithdraw = this.pendingWithdraw.has(channelId.toLowerCase());
    if (shouldWithdraw) {
      this.pendingWithdraw.delete(channelId.toLowerCase());
    }

    const payload: DeferredVoucherPayload = {
      type: "voucher",
      channelConfig: config,
      ...voucher,
      ...(shouldWithdraw ? { withdraw: true } : {}),
    };

    return {
      x402Version,
      payload,
    };
  }

  /**
   * Computes the deposit amount based on the deposit policy (multiplier and cap).
   *
   * @param requestAmount - Amount requested for this operation, in token base units.
   * @returns Deposit amount string in token base units.
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
