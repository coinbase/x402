import {
  AssetAmount,
  Network,
  PaymentRequirements,
  PaymentPayload,
  Price,
  SchemeNetworkServer,
  SchemeServerHooks,
  MoneyParser,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import type { FacilitatorClient, SettleContext, VerifyContext } from "@x402/core/server";
import { DeferredChannelManager } from "./settlement";
import { getAddress, encodeAbiParameters, keccak256, concatHex } from "viem";
import { getDefaultAsset } from "../../shared/defaultAssets";
import { getEvmChainId } from "../../utils";
import {
  isDeferredDepositPayload,
  isDeferredVoucherPayload,
  isDeferredCooperativeWithdrawPayload,
  isDeferredCooperativeWithdrawWithSignaturePayload,
} from "../types";
import type { ChannelConfig, DeferredVoucherClaim } from "../types";
import {
  BATCH_SETTLEMENT_ADDRESS,
  BATCH_SETTLEMENT_DOMAIN,
  cooperativeWithdrawTypes,
  claimBatchTypes,
} from "../constants";
import { computeChannelId } from "../utils";
import { InMemorySessionStorage, SessionStorage, ChannelSession } from "./storage";

export interface AuthorizerSigner {
  address: `0x${string}`;
  signTypedData(params: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
}

export interface DeferredEvmSchemeServerConfig {
  storage?: SessionStorage;
  receiverAuthorizerSigner?: AuthorizerSigner;
  withdrawDelay?: number;
}

/**
 * Server-side implementation of the `batch-settlement` scheme for EVM networks.
 *
 * Manages per-channel session state (cumulative amounts, voucher signatures, balances)
 * via lifecycle hooks that integrate with the x402 resource-server middleware.  The scheme
 * skips on-chain settlement for voucher-only requests by returning a deferred result and
 * only hits the chain for deposits or cooperative withdrawals.
 */
export class DeferredEvmScheme implements SchemeNetworkServer {
  readonly scheme = "batch-settlement";
  readonly schemeHooks: SchemeServerHooks;

  private moneyParsers: MoneyParser[] = [];
  private readonly storage: SessionStorage;
  private readonly receiverAuthorizerSigner: AuthorizerSigner | undefined;
  private readonly receiverAddress: `0x${string}`;
  private readonly withdrawDelay: number;
  private pendingCooperativeWithdrawChannels = new Set<string>();

  /**
   * Constructs a batch-settlement server scheme.
   *
   * @param receiverAddress - The server's receiver address (payTo).
   * @param config - Optional configuration for storage, receiver-authorizer signer, and withdraw delay.
   */
  constructor(receiverAddress: `0x${string}`, config?: DeferredEvmSchemeServerConfig) {
    this.receiverAddress = receiverAddress;
    this.storage = config?.storage ?? new InMemorySessionStorage();
    this.receiverAuthorizerSigner = config?.receiverAuthorizerSigner;
    this.withdrawDelay = config?.withdrawDelay ?? 900;
    this.schemeHooks = {
      onBeforeVerify: this.handleBeforeVerify.bind(this),
      onAfterVerify: this.handleAfterVerify.bind(this),
      onBeforeSettle: this.handleBeforeSettle.bind(this),
      onAfterSettle: this.handleAfterSettle.bind(this),
    };
  }

  /**
   * Registers a custom money parser for converting price strings to token amounts.
   *
   * @param parser - A parser function to try before the default USD→token conversion.
   * @returns `this` for chaining.
   */
  registerMoneyParser(parser: MoneyParser): DeferredEvmScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Resolves a human-readable price (e.g. `"$0.01"`) into an on-chain token amount.
   *
   * @param price - A price string, number, or explicit {@link AssetAmount}.
   * @param network - CAIP-2 network identifier for looking up the default asset.
   * @returns Token amount with asset address and metadata.
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    const amount = this.parseMoneyToDecimal(price);

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Injects batch-settlement-specific fields into the payment requirements returned to
   * the client (receiverAuthorizer, withdrawDelay, EIP-712 domain info).
   *
   * @param paymentRequirements - Base payment requirements from the middleware.
   * @param _supportedKind - Matched scheme/network kind (extra may contain overrides).
   * @param _supportedKind.x402Version - Protocol version from the matched kind.
   * @param _supportedKind.scheme - Scheme name from the matched kind.
   * @param _supportedKind.network - Network identifier from the matched kind.
   * @param _supportedKind.extra - Optional extra fields on the matched kind.
   * @param _extensionKeys - Extension keys (unused).
   * @returns Enhanced payment requirements with batch-settlement fields in `extra`.
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    _extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    void _supportedKind;
    void _extensionKeys;

    const assetInfo = getDefaultAsset(paymentRequirements.network as Network);

    const receiverAuthorizer = this.receiverAuthorizerSigner
      ? this.receiverAuthorizerSigner.address
      : (_supportedKind.extra?.receiverAuthorizer as string | undefined);

    return Promise.resolve({
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        receiverAuthorizer: receiverAuthorizer ?? "",
        withdrawDelay: this.withdrawDelay,
        name: assetInfo.name,
        version: assetInfo.version,
      },
    });
  }

  /**
   * Returns the underlying session storage instance.
   *
   * @returns The configured {@link SessionStorage} backend.
   */
  getStorage(): SessionStorage {
    return this.storage;
  }

  /**
   * Returns the server's receiver address.
   *
   * @returns Receiver wallet address for the payment channel.
   */
  getReceiverAddress(): `0x${string}` {
    return this.receiverAddress;
  }

  /**
   * Returns the configured withdraw delay (seconds).
   *
   * @returns Withdraw delay in seconds before uncooperative withdrawal is allowed.
   */
  getWithdrawDelay(): number {
    return this.withdrawDelay;
  }

  /**
   * Returns the receiver-authorizer signer address, if configured.
   *
   * @returns Receiver-authorizer address, or `undefined` when not set.
   */
  getReceiverAuthorizerAddress(): `0x${string}` | undefined {
    return this.receiverAuthorizerSigner?.address;
  }

  /**
   * Creates a {@link DeferredChannelManager} pre-configured with this scheme's
   * receiver, default token for the given network, and the provided facilitator.
   *
   * @param facilitator - Facilitator client for submitting on-chain claims/settlements.
   * @param network - CAIP-2 network identifier (e.g. `"eip155:84532"`).
   * @returns A ready-to-use channel manager.
   */
  createChannelManager(facilitator: FacilitatorClient, network: Network): DeferredChannelManager {
    const token = getDefaultAsset(network).address as `0x${string}`;
    return new DeferredChannelManager({
      scheme: this,
      facilitator,
      receiver: this.receiverAddress,
      token,
      network,
    });
  }

  /**
   * Collects vouchers that are eligible for on-chain claiming.
   *
   * A voucher is claimable when its `chargedCumulativeAmount` exceeds what has already
   * been claimed on-chain.  An optional idle filter skips sessions that received a
   * request within the last `idleSecs` seconds.
   *
   * @param opts - Optional filtering: `idleSecs` to only return idle channels.
   * @param opts.idleSecs - Minimum seconds since last request for a channel to be included.
   * @returns Array of {@link DeferredVoucherClaim} entries for batch submission.
   */
  async getClaimableVouchers(opts?: { idleSecs?: number }): Promise<DeferredVoucherClaim[]> {
    const sessions = await this.storage.list();
    const now = Date.now();
    const claims: DeferredVoucherClaim[] = [];

    for (const s of sessions) {
      if (BigInt(s.chargedCumulativeAmount) <= BigInt(s.totalClaimed)) {
        continue;
      }
      if (opts?.idleSecs !== undefined) {
        const idleMs = now - s.lastRequestTimestamp;
        if (idleMs < opts.idleSecs * 1000) {
          continue;
        }
      }
      claims.push({
        voucher: {
          channel: s.channelConfig,
          maxClaimableAmount: s.signedMaxClaimable,
        },
        signature: s.signature as `0x${string}`,
        claimAmount: s.chargedCumulativeAmount,
      });
    }

    return claims;
  }

  /**
   * Returns sessions that have a pending payer-initiated withdrawal.
   *
   * @returns All stored sessions with `withdrawRequestedAt` set.
   */
  async getWithdrawalPendingSessions(): Promise<ChannelSession[]> {
    const sessions = await this.storage.list();
    return sessions.filter(s => s.withdrawRequestedAt > 0);
  }

  /**
   * Produces a `CooperativeWithdraw` EIP-712 signature from the receiver-authorizer signer,
   * permitting the payer to immediately withdraw remaining channel funds.
   *
   * @param channelId - The channel to authorize withdrawal for.
   * @param network - CAIP-2 network identifier (used for EIP-712 chain id).
   * @returns The receiver-authorizer's EIP-712 signature over `CooperativeWithdraw(channelId)`.
   */
  async signCooperativeWithdraw(channelId: `0x${string}`, network: string): Promise<`0x${string}`> {
    if (!this.receiverAuthorizerSigner) {
      throw new Error("receiverAuthorizerSigner is not configured");
    }

    const chainId = getEvmChainId(network);

    return this.receiverAuthorizerSigner.signTypedData({
      domain: {
        ...BATCH_SETTLEMENT_DOMAIN,
        chainId,
        verifyingContract: getAddress(BATCH_SETTLEMENT_ADDRESS),
      },
      types: cooperativeWithdrawTypes as unknown as Record<
        string,
        Array<{ name: string; type: string }>
      >,
      primaryType: "CooperativeWithdraw",
      message: {
        channelId,
      },
    });
  }

  /**
   * Produces a `ClaimBatch` EIP-712 signature from the receiver-authorizer signer,
   * authorizing a third party (e.g. facilitator) to submit a batch claim via
   * `claimWithSignature()`.
   *
   * @param claims - The voucher claims to authorize.
   * @param network - CAIP-2 network identifier (used for EIP-712 chain id).
   * @returns The receiver-authorizer's EIP-712 signature over `ClaimBatch(claimsHash)`.
   */
  async signClaimBatch(claims: DeferredVoucherClaim[], network: string): Promise<`0x${string}`> {
    if (!this.receiverAuthorizerSigner) {
      throw new Error("receiverAuthorizerSigner is not configured");
    }

    const chainId = getEvmChainId(network);

    const hashes = claims.map(c => {
      const channelId = computeChannelId(c.voucher.channel);
      return keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "uint128" }, { type: "uint128" }],
          [channelId, BigInt(c.voucher.maxClaimableAmount), BigInt(c.claimAmount)],
        ),
      );
    });
    const claimsHash = keccak256(concatHex(hashes));

    return this.receiverAuthorizerSigner.signTypedData({
      domain: {
        ...BATCH_SETTLEMENT_DOMAIN,
        chainId,
        verifyingContract: getAddress(BATCH_SETTLEMENT_ADDRESS),
      },
      types: claimBatchTypes as unknown as Record<string, Array<{ name: string; type: string }>>,
      primaryType: "ClaimBatch",
      message: {
        claimsHash,
      },
    });
  }

  /**
   * Lifecycle hook: runs before the facilitator verifies a payment.
   *
   * For voucher payloads, checks whether the client's cumulative amount matches server
   * state.  If stale, aborts with `batch_settlement_stale_cumulative_amount` and embeds
   * the correct state in `requirements.extra` so the client can resync.
   *
   * @param ctx - Verify lifecycle context (payload, requirements, and related state).
   * @returns Nothing to continue verification; or an object with `abort` to fail with a reason.
   */
  private async handleBeforeVerify(
    ctx: VerifyContext,
  ): Promise<void | { abort: true; reason: string; message?: string }> {
    const { paymentPayload, requirements } = ctx;
    if (requirements.scheme !== "batch-settlement") {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;
    if (!isDeferredVoucherPayload(raw)) {
      return;
    }

    const session = await this.storage.get(raw.channelId as string);
    if (!session) {
      return;
    }

    const expectedMaxClaimable =
      BigInt(session.chargedCumulativeAmount) + BigInt(requirements.amount);

    if (BigInt(raw.maxClaimableAmount as string) === expectedMaxClaimable) {
      return;
    }

    requirements.extra = {
      ...requirements.extra,
      chargedCumulativeAmount: session.chargedCumulativeAmount,
      signedMaxClaimable: session.signedMaxClaimable,
      signature: session.signature,
    };

    return {
      abort: true,
      reason: "batch_settlement_stale_cumulative_amount",
      message: "Client voucher base does not match server state",
    };
  }

  /**
   * Lifecycle hook: runs after the facilitator verifies a payment.
   *
   * Persists channel session state (balance, totalClaimed, voucher info) so that
   * subsequent requests can correctly calculate cumulative amounts and detect stale state.
   *
   * @param ctx - Post-verify lifecycle context.
   * @param ctx.paymentPayload - Incoming payment payload that was verified.
   * @param ctx.requirements - Requirements used for verification.
   * @param ctx.result - Facilitator verify response.
   * @returns Resolves when session state has been persisted (no return value).
   */
  private async handleAfterVerify(ctx: {
    paymentPayload: PaymentPayload;
    requirements: PaymentRequirements;
    result: VerifyResponse;
  }): Promise<void> {
    const { paymentPayload, requirements, result } = ctx;
    if (requirements.scheme !== "batch-settlement" || !result.isValid || !result.payer) {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;
    let channelId: string;
    let signedMaxClaimable: string;
    let signature: `0x${string}`;
    let payer: string;
    let channelConfig: ChannelConfig | undefined;

    if (isDeferredDepositPayload(raw)) {
      channelId = raw.voucher.channelId as string;
      signedMaxClaimable = raw.voucher.maxClaimableAmount as string;
      signature = raw.voucher.signature as `0x${string}`;
      channelConfig = (raw.deposit as Record<string, unknown>).channelConfig as
        | ChannelConfig
        | undefined;
      payer = channelConfig?.payer ?? result.payer;
    } else if (isDeferredVoucherPayload(raw)) {
      channelId = raw.channelId as string;
      signedMaxClaimable = raw.maxClaimableAmount as string;
      signature = raw.signature as `0x${string}`;
      channelConfig = raw.channelConfig as ChannelConfig | undefined;
      payer = channelConfig?.payer ?? result.payer;
    } else {
      return;
    }

    const ex = result.extra ?? {};
    const balance =
      typeof ex.balance === "string"
        ? ex.balance
        : typeof ex.balance === "number"
          ? String(ex.balance)
          : "0";
    const totalClaimed =
      typeof ex.totalClaimed === "string"
        ? ex.totalClaimed
        : typeof ex.totalClaimed === "number"
          ? String(ex.totalClaimed)
          : "0";
    const withdrawRequestedAt =
      typeof ex.withdrawRequestedAt === "number"
        ? ex.withdrawRequestedAt
        : typeof ex.withdrawRequestedAt === "string"
          ? parseInt(ex.withdrawRequestedAt, 10) || 0
          : 0;

    const prev = await this.storage.get(channelId);
    const resolvedConfig = channelConfig ?? prev?.channelConfig;
    if (!resolvedConfig) {
      return;
    }
    const session: ChannelSession = {
      channelId,
      channelConfig: resolvedConfig,
      payer: payer.toLowerCase(),
      chargedCumulativeAmount: prev?.chargedCumulativeAmount ?? "0",
      signedMaxClaimable,
      signature,
      balance,
      totalClaimed,
      withdrawRequestedAt,
      lastRequestTimestamp: Date.now(),
    };
    await this.storage.compareAndSet(
      channelId,
      prev?.chargedCumulativeAmount ?? "0",
      session,
    );
  }

  /**
   * Lifecycle hook: runs before the facilitator settles a payment.
   *
   * For voucher payloads the server does NOT trigger an on-chain settle.  Instead, it
   * increments the local `chargedCumulativeAmount` and returns a `skip` result so the
   * middleware responds immediately (deferred settlement).  If the client requests a
   * cooperative withdrawal, the payload is rewritten to a `cooperativeWithdraw` settle
   * action that the facilitator will execute on-chain.
   *
   * @param ctx - Settle lifecycle context (payload and requirements).
   * @returns Nothing to proceed; `abort` to fail; `skip` with a result to short-circuit settlement.
   */
  private async handleBeforeSettle(
    ctx: SettleContext,
  ): Promise<
    | void
    | { abort: true; reason: string; message?: string }
    | { skip: true; result: SettleResponse }
  > {
    const { paymentPayload, requirements } = ctx;
    if (requirements.scheme !== "batch-settlement") {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;
    if (!isDeferredVoucherPayload(raw)) {
      return;
    }

    const channelId = raw.channelId as string;
    const session = await this.storage.get(channelId);
    if (!session) {
      return {
        abort: true,
        reason: "missing_deferred_session",
        message: "No session for channel; verify may not have completed",
      };
    }

    const increment = BigInt(requirements.amount);
    const signedCap = BigInt(raw.maxClaimableAmount as string);
    const prevCharged = BigInt(session.chargedCumulativeAmount);
    const newCharged = prevCharged + increment;

    if (newCharged > signedCap) {
      return {
        abort: true,
        reason: "deferred_charge_exceeds_signed_cumulative",
        message: `Charged ${newCharged.toString()} exceeds signed max ${signedCap.toString()}`,
      };
    }

    if (raw.withdraw === true) {
      const config = session.channelConfig;

      const claimEntry: DeferredVoucherClaim = {
        voucher: {
          channel: config,
          maxClaimableAmount: raw.maxClaimableAmount as string,
        },
        signature: raw.signature as `0x${string}`,
        claimAmount: newCharged.toString(),
      };

      if (this.receiverAuthorizerSigner) {
        const authorizerSignature = await this.signCooperativeWithdraw(
          channelId as `0x${string}`,
          requirements.network,
        );

        const claimAuthorizerSignature = await this.signClaimBatch(
          [claimEntry],
          requirements.network,
        );

        (paymentPayload as { payload: unknown }).payload = {
          settleAction: "cooperativeWithdrawWithSignature",
          config,
          claims: [claimEntry],
          receiverAuthorizerSignature: authorizerSignature,
          claimAuthorizerSignature,
        };
      } else {
        (paymentPayload as { payload: unknown }).payload = {
          settleAction: "cooperativeWithdraw",
          config,
          claims: [claimEntry],
        };
      }

      this.pendingCooperativeWithdrawChannels.add(channelId.toLowerCase());
      return;
    }

    const updatedSession: ChannelSession = {
      channelId,
      channelConfig: session.channelConfig,
      payer: session.payer,
      chargedCumulativeAmount: newCharged.toString(),
      signedMaxClaimable: raw.maxClaimableAmount as string,
      signature: raw.signature as `0x${string}`,
      balance: session.balance,
      totalClaimed: session.totalClaimed,
      withdrawRequestedAt: session.withdrawRequestedAt,
      lastRequestTimestamp: Date.now(),
    };

    const swapped = await this.storage.compareAndSet(
      channelId,
      session.chargedCumulativeAmount,
      updatedSession,
    );
    if (!swapped) {
      return {
        abort: true,
        reason: "deferred_channel_busy",
        message: "Concurrent request modified channel state",
      };
    }

    return {
      skip: true,
      result: {
        success: true,
        transaction: "",
        network: requirements.network,
        payer: session.payer as `0x${string}`,
        amount: requirements.amount,
        extra: {
          chargedCumulativeAmount: newCharged.toString(),
          channelId,
          balance: session.balance,
          totalClaimed: session.totalClaimed,
          withdrawRequestedAt: session.withdrawRequestedAt,
        },
      },
    };
  }

  /**
   * Lifecycle hook: runs after the facilitator settles a payment.
   *
   * Updates session state to reflect the settlement outcome — adjusting charged amounts,
   * balances, and handling cooperative-withdrawal cleanup (session deletion).
   *
   * @param ctx - Post-settle lifecycle context.
   * @param ctx.paymentPayload - Payment payload that was settled (possibly rewritten).
   * @param ctx.requirements - Requirements used for settlement.
   * @param ctx.result - Facilitator settle response.
   * @returns Resolves when session updates are complete (no return value).
   */
  private async handleAfterSettle(ctx: {
    paymentPayload: PaymentPayload;
    requirements: PaymentRequirements;
    result: SettleResponse;
  }): Promise<void> {
    const { paymentPayload, requirements, result } = ctx;
    if (requirements.scheme !== "batch-settlement" || !result.success) {
      return;
    }

    const raw = paymentPayload.payload as Record<string, unknown>;

    if (
      isDeferredCooperativeWithdrawWithSignaturePayload(raw) ||
      isDeferredCooperativeWithdrawPayload(raw)
    ) {
      const channelId =
        typeof (raw.config as Record<string, unknown>)?.payer === "string"
          ? (result.extra as Record<string, unknown>)?.channelId
          : undefined;
      const channelIdStr =
        typeof channelId === "string" ? channelId : raw.claims ? undefined : undefined;

      if (channelIdStr) {
        this.pendingCooperativeWithdrawChannels.delete(channelIdStr.toLowerCase());
        await this.storage.delete(channelIdStr);
      }

      result.extra = {
        ...result.extra,
        cooperativeWithdraw: true,
      };
      return;
    }

    if (isDeferredVoucherPayload(raw)) {
      return;
    }

    if (isDeferredDepositPayload(raw)) {
      const channelId = (raw.voucher as Record<string, unknown>).channelId as string;
      const ex = result.extra ?? {};
      const balanceSnap =
        typeof ex.balance === "string"
          ? ex.balance
          : typeof ex.balance === "number"
            ? String(ex.balance)
            : "0";
      const totalClaimedSnap =
        typeof ex.totalClaimed === "string"
          ? ex.totalClaimed
          : typeof ex.totalClaimed === "number"
            ? String(ex.totalClaimed)
            : "0";
      const withdrawAtSnap =
        typeof ex.withdrawRequestedAt === "number"
          ? ex.withdrawRequestedAt
          : typeof ex.withdrawRequestedAt === "string"
            ? parseInt(ex.withdrawRequestedAt, 10) || 0
            : 0;

      const prevSession = await this.storage.get(channelId);
      const depositConfig = (raw.deposit as Record<string, unknown>)?.channelConfig as
        | ChannelConfig
        | undefined;
      const resolvedConfig = depositConfig ?? prevSession?.channelConfig;
      if (!resolvedConfig) {
        return;
      }
      const chargedActual = (
        BigInt(prevSession?.chargedCumulativeAmount ?? "0") + BigInt(requirements.amount)
      ).toString();
      const signedMaxClaimable = (raw.voucher as Record<string, unknown>)
        .maxClaimableAmount as string;
      const payer = resolvedConfig.payer ?? result.payer ?? "";

      const session: ChannelSession = {
        channelId,
        channelConfig: resolvedConfig,
        payer: payer.toLowerCase(),
        chargedCumulativeAmount: chargedActual,
        signedMaxClaimable,
        signature: (raw.voucher as Record<string, unknown>).signature as `0x${string}`,
        balance: balanceSnap,
        totalClaimed: totalClaimedSnap,
        withdrawRequestedAt: withdrawAtSnap,
        lastRequestTimestamp: Date.now(),
      };
      await this.storage.set(channelId, session);
      result.extra = {
        ...ex,
        channelId,
        chargedCumulativeAmount: chargedActual,
      };
    }
  }

  /**
   * Parses a human-readable money string (e.g. `"$1.50"`) into a decimal number.
   *
   * @param money - Money string (may include `$`) or numeric amount.
   * @returns Parsed finite number.
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }

    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);

    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }

    return amount;
  }

  /**
   * Converts a decimal dollar amount to the network's default token amount.
   *
   * @param amount - Decimal amount in display units.
   * @param network - Target chain/network for default asset resolution.
   * @returns {@link AssetAmount} with integer token amount, contract address, and metadata.
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const assetInfo = getDefaultAsset(network);
    const tokenAmount = this.convertToTokenAmount(amount.toString(), assetInfo.decimals);

    return {
      amount: tokenAmount,
      asset: assetInfo.address,
      extra: {
        name: assetInfo.name,
        version: assetInfo.version,
      },
    };
  }

  /**
   * Converts a decimal amount string to its integer token representation.
   *
   * @param decimalAmount - Amount as a decimal string (e.g. `"1.23"`).
   * @param decimals - Token decimals (fractional digit count).
   * @returns Integer token amount as a string (no decimal point).
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
    const amount = parseFloat(decimalAmount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`);
    }
    const [intPart, decPart = ""] = String(amount).split(".");
    const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
    const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
    return tokenAmount;
  }
}
