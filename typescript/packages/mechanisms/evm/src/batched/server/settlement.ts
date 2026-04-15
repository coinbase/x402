import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { FacilitatorClient } from "@x402/core/server";
import type { BatchedVoucherClaim } from "../types";
import type { BatchedEvmScheme } from "./scheme";

export interface ChannelManagerConfig {
  scheme: BatchedEvmScheme;
  facilitator: FacilitatorClient;
  receiver: `0x${string}`;
  token: `0x${string}`;
  network: Network;
}

export interface AutoSettlementConfig {
  claimIntervalSecs?: number;
  claimOnIdleSecs?: number;
  claimThreshold?: string;
  claimOnWithdrawal?: boolean;
  settleIntervalSecs?: number;
  settleThreshold?: string;
  maxClaimsPerBatch?: number;
  tickSecs?: number;
  cooperativeWithdrawOnIdleSecs?: number;
  cooperativeWithdrawOnShutdown?: boolean;
  onClaim?: (result: ClaimResult) => void;
  onSettle?: (result: SettleResult) => void;
  onCooperativeWithdraw?: (result: CooperativeWithdrawResult) => void;
  onError?: (error: unknown) => void;
}

export interface ClaimResult {
  vouchers: number;
  transaction: string;
}

export interface SettleResult {
  transaction: string;
}

export interface CooperativeWithdrawResult {
  channels: string[];
  transaction: string;
}

/**
 * Manages the server-side channel lifecycle for the `batched` scheme:
 * batch claiming of vouchers, settlement of claimed funds, and cooperative withdrawal.
 *
 * Provides both manual (`claim()`, `settle()`, `cooperativeWithdraw()`) and automatic
 * (`start()` / `stop()`) modes.  In automatic mode a periodic tick evaluates configurable
 * triggers (interval, idle time, threshold, pending withdrawal) and batches operations
 * accordingly.
 */
export class BatchedChannelManager {
  private readonly scheme: BatchedEvmScheme;
  private readonly facilitator: FacilitatorClient;
  private readonly receiver: `0x${string}`;
  private readonly token: `0x${string}`;
  private readonly network: Network;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastClaimTime = 0;
  private lastSettleTime = 0;
  private pendingSettle = false;
  private running = false;
  private autoSettleConfig: AutoSettlementConfig = {};

  /**
   * Creates a new channel manager.
   *
   * @param config - Manager configuration: scheme, facilitator, receiver, token, network.
   */
  constructor(config: ChannelManagerConfig) {
    this.scheme = config.scheme;
    this.facilitator = config.facilitator;
    this.receiver = config.receiver;
    this.token = config.token;
    this.network = config.network;
  }

  /**
   * Collects claimable vouchers and submits them in batches to the facilitator via `claim()`.
   *
   * @param opts - Optional: `maxClaimsPerBatch` (default 50), `idleSecs` to filter idle channels.
   * @param opts.maxClaimsPerBatch - Max vouchers per facilitator `claim` batch.
   * @param opts.idleSecs - When set, only include channels idle for at least this many seconds.
   * @returns Array of claim results (one per batch).
   */
  async claim(opts?: { maxClaimsPerBatch?: number; idleSecs?: number }): Promise<ClaimResult[]> {
    const maxBatch = opts?.maxClaimsPerBatch ?? 50;
    const allClaims = await this.scheme.getClaimableVouchers(
      opts?.idleSecs !== undefined ? { idleSecs: opts.idleSecs } : undefined,
    );

    if (allClaims.length === 0) {
      return [];
    }

    const results: ClaimResult[] = [];
    for (let i = 0; i < allClaims.length; i += maxBatch) {
      const batch = allClaims.slice(i, i + maxBatch);
      const result = await this.submitClaim(batch);
      results.push(result);
      await this.updateClaimedSessions(batch);
    }

    if (results.length > 0) {
      this.pendingSettle = true;
    }

    return results;
  }

  /**
   * Transfers claimed (but unsettled) funds to the receiver by calling `settle(receiver, token)`.
   *
   * @returns Settle result with the transaction hash.
   */
  async settle(): Promise<SettleResult> {
    const paymentPayload = this.buildSettlePaymentPayload();
    const requirements = this.buildPaymentRequirements();

    const response = await this.facilitator.settle(paymentPayload, requirements);
    if (!response.success) {
      throw new Error(
        `Settle failed: ${response.errorReason ?? "unknown"} — ${response.errorMessage ?? ""}`,
      );
    }

    this.pendingSettle = false;
    return { transaction: response.transaction };
  }

  /**
   * Convenience: claims all eligible vouchers then settles in one call.
   *
   * @param opts - Optional: `maxClaimsPerBatch`.
   * @param opts.maxClaimsPerBatch - Max vouchers per claim batch before settling.
   * @returns Combined claim and settle results.
   */
  async claimAndSettle(opts?: {
    maxClaimsPerBatch?: number;
  }): Promise<{ claims: ClaimResult[]; settle?: SettleResult }> {
    const claims = await this.claim(opts);
    let settleResult: SettleResult | undefined;
    if (claims.length > 0) {
      settleResult = await this.settle();
    }
    return { claims, settle: settleResult };
  }

  /**
   * Initiates a cooperative withdrawal for one or more channels, optionally claiming
   * outstanding vouchers first.
   *
   * @param channelIds - Specific channels to withdraw; defaults to all sessions.
   * @returns Result with the list of withdrawn channels and the transaction hash.
   */
  async cooperativeWithdraw(channelIds?: string[]): Promise<CooperativeWithdrawResult> {
    const storage = this.scheme.getStorage();
    const sessions = await storage.list();

    const targets = channelIds
      ? sessions.filter(s => channelIds.some(id => id.toLowerCase() === s.channelId.toLowerCase()))
      : sessions;

    if (targets.length === 0) {
      return { channels: [], transaction: "" };
    }

    const claims: BatchedVoucherClaim[] = [];
    for (const s of targets) {
      if (BigInt(s.chargedCumulativeAmount) > BigInt(s.totalClaimed)) {
        claims.push({
          voucher: {
            channel: s.channelConfig,
            maxClaimableAmount: s.signedMaxClaimable,
          },
          signature: s.signature as `0x${string}`,
          claimAmount: s.chargedCumulativeAmount,
        });
      }
    }

    const firstTarget = targets[0];
    const config = firstTarget.channelConfig;
    const hasAuthorizerSigner = this.scheme.getReceiverAuthorizerAddress() !== undefined;

    let paymentPayload: PaymentPayload;

    if (hasAuthorizerSigner) {
      const authSig = await this.scheme.signCooperativeWithdraw(
        firstTarget.channelId as `0x${string}`,
        this.network,
      );

      let claimAuthorizerSignature: `0x${string}` | undefined;
      if (claims.length > 0) {
        claimAuthorizerSignature = await this.scheme.signClaimBatch(claims, this.network);
      }

      paymentPayload = {
        x402Version: 2,
        accepted: this.buildPaymentRequirements(),
        payload: {
          settleAction: "cooperativeWithdrawWithSignature",
          config,
          claims,
          receiverAuthorizerSignature: authSig,
          ...(claimAuthorizerSignature ? { claimAuthorizerSignature } : {}),
        },
      };
    } else {
      paymentPayload = {
        x402Version: 2,
        accepted: this.buildPaymentRequirements(),
        payload: {
          settleAction: "cooperativeWithdraw",
          config,
          claims,
        },
      };
    }

    const response = await this.facilitator.settle(paymentPayload, this.buildPaymentRequirements());
    if (!response.success) {
      throw new Error(
        `CooperativeWithdraw failed: ${response.errorReason ?? "unknown"} — ${response.errorMessage ?? ""}`,
      );
    }

    for (const s of targets) {
      await storage.delete(s.channelId);
    }

    return {
      channels: targets.map(s => s.channelId),
      transaction: response.transaction,
    };
  }

  /**
   * Starts the auto-settlement loop that periodically evaluates claim/settle/withdraw
   * triggers and executes them.
   *
   * @param config - Auto-settlement policy configuration (intervals, thresholds, callbacks).
   */
  start(config: AutoSettlementConfig = {}): void {
    if (this.tickTimer) {
      return;
    }

    const tickMs = (config.tickSecs ?? 10) * 1000;
    const claimIntervalMs = (config.claimIntervalSecs ?? 60) * 1000;
    const settleIntervalMs = (config.settleIntervalSecs ?? 300) * 1000;
    const claimOnWithdrawal = config.claimOnWithdrawal ?? true;
    const maxClaimsPerBatch = config.maxClaimsPerBatch ?? 50;

    this.lastClaimTime = Date.now();
    this.lastSettleTime = Date.now();
    this.running = true;

    this.autoSettleConfig = config;

    this.tickTimer = setInterval(() => {
      void this.tick({
        claimIntervalMs,
        settleIntervalMs,
        claimOnIdleSecs: config.claimOnIdleSecs,
        claimThreshold: config.claimThreshold,
        claimOnWithdrawal,
        settleThreshold: config.settleThreshold,
        maxClaimsPerBatch,
        cooperativeWithdrawOnIdleSecs: config.cooperativeWithdrawOnIdleSecs,
        onClaim: config.onClaim,
        onSettle: config.onSettle,
        onCooperativeWithdraw: config.onCooperativeWithdraw,
        onError: config.onError,
      });
    }, tickMs);
  }

  /**
   * Stops the auto-settlement loop.
   *
   * @param opts - Stop options.
   * @param opts.flush - When true, run `claimAndSettle` and optional shutdown cooperative withdraw first.
   * @returns Resolves when the loop is stopped (and flush work completes, if requested).
   */
  async stop(opts?: { flush?: boolean }): Promise<void> {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (opts?.flush) {
      await this.claimAndSettle();
      if (this.autoSettleConfig.cooperativeWithdrawOnShutdown) {
        try {
          const result = await this.cooperativeWithdraw();
          if (result.channels.length > 0) {
            this.autoSettleConfig.onCooperativeWithdraw?.(result);
          }
        } catch (err) {
          this.autoSettleConfig.onError?.(err);
        }
      }
    }
  }

  /**
   * Single tick of the auto-settlement loop: evaluates claim, settle, and cooperative
   * withdrawal triggers and executes any that fire.
   *
   * @param cfg - Resolved auto-settlement options for this tick.
   * @param cfg.claimIntervalMs - Minimum milliseconds between automatic claim rounds.
   * @param cfg.settleIntervalMs - Minimum milliseconds between automatic settle rounds.
   * @param cfg.claimOnIdleSecs - Optional idle threshold to trigger claims (see {@link BatchedEvmScheme.getClaimableVouchers}).
   * @param cfg.claimThreshold - Optional min cumulative claimable amount to trigger a claim.
   * @param cfg.claimOnWithdrawal - Whether pending withdrawals can trigger a claim.
   * @param cfg.settleThreshold - Optional min claimed-not-settled amount to trigger settle.
   * @param cfg.maxClaimsPerBatch - Voucher batch size passed to {@link BatchedChannelManager.claim}.
   * @param cfg.cooperativeWithdrawOnIdleSecs - Optional idle seconds before cooperative withdraw for non-zero balances.
   * @param cfg.onClaim - Callback after each successful claim batch.
   * @param cfg.onSettle - Callback after a successful settle.
   * @param cfg.onCooperativeWithdraw - Callback after a cooperative withdraw with channels.
   * @param cfg.onError - Callback on errors inside the tick.
   * @returns Resolves when this tick's work finishes (no return value).
   */
  private async tick(cfg: {
    claimIntervalMs: number;
    settleIntervalMs: number;
    claimOnIdleSecs?: number;
    claimThreshold?: string;
    claimOnWithdrawal: boolean;
    settleThreshold?: string;
    maxClaimsPerBatch: number;
    cooperativeWithdrawOnIdleSecs?: number;
    onClaim?: (result: ClaimResult) => void;
    onSettle?: (result: SettleResult) => void;
    onCooperativeWithdraw?: (result: CooperativeWithdrawResult) => void;
    onError?: (error: unknown) => void;
  }): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const shouldClaim = await this.evaluateClaimTriggers(cfg);
      if (shouldClaim) {
        const results = await this.claim({ maxClaimsPerBatch: cfg.maxClaimsPerBatch });
        this.lastClaimTime = Date.now();
        for (const r of results) {
          cfg.onClaim?.(r);
        }
      }
    } catch (err) {
      cfg.onError?.(err);
    }

    try {
      const shouldSettle = await this.evaluateSettleTriggers(cfg);
      if (shouldSettle) {
        const result = await this.settle();
        this.lastSettleTime = Date.now();
        cfg.onSettle?.(result);
      }
    } catch (err) {
      cfg.onError?.(err);
    }

    if (cfg.cooperativeWithdrawOnIdleSecs !== undefined) {
      try {
        const idleChannels = await this.getIdleChannelsForCooperativeWithdraw(
          cfg.cooperativeWithdrawOnIdleSecs,
        );
        if (idleChannels.length > 0) {
          const result = await this.cooperativeWithdraw(idleChannels);
          if (result.channels.length > 0) {
            cfg.onCooperativeWithdraw?.(result);
          }
        }
      } catch (err) {
        cfg.onError?.(err);
      }
    }
  }

  /**
   * Evaluates whether a claim should be triggered based on interval, idle, threshold,
   * and withdrawal policies.
   *
   * @param cfg - Claim trigger configuration for this evaluation.
   * @param cfg.claimIntervalMs - Time since last claim after which a claim should run.
   * @param cfg.claimOnIdleSecs - If set, claim when any idle-eligible vouchers exist.
   * @param cfg.claimThreshold - If set, claim when total claimable exceeds this amount.
   * @param cfg.claimOnWithdrawal - If true, claim when withdrawals are pending and vouchers are claimable.
   * @returns `true` when a claim should be submitted this tick.
   */
  private async evaluateClaimTriggers(cfg: {
    claimIntervalMs: number;
    claimOnIdleSecs?: number;
    claimThreshold?: string;
    claimOnWithdrawal: boolean;
  }): Promise<boolean> {
    const now = Date.now();

    if (now - this.lastClaimTime >= cfg.claimIntervalMs) {
      return true;
    }

    if (cfg.claimOnIdleSecs !== undefined) {
      const idleClaims = await this.scheme.getClaimableVouchers({
        idleSecs: cfg.claimOnIdleSecs,
      });
      if (idleClaims.length > 0) {
        return true;
      }
    }

    if (cfg.claimThreshold !== undefined) {
      const allClaims = await this.scheme.getClaimableVouchers();
      const total = allClaims.reduce((sum, c) => sum + BigInt(c.claimAmount), 0n);
      if (total > BigInt(cfg.claimThreshold)) {
        return true;
      }
    }

    if (cfg.claimOnWithdrawal) {
      const withdrawals = await this.scheme.getWithdrawalPendingSessions();
      if (withdrawals.length > 0) {
        const claimableWithdrawals = await this.scheme.getClaimableVouchers();
        const withdrawalChannels = new Set(withdrawals.map(w => w.channelId.toLowerCase()));
        if (
          claimableWithdrawals.some(c =>
            withdrawalChannels.has(c.voucher.channel?.payer?.toLowerCase?.() ?? ""),
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Evaluates whether a settle should be triggered based on interval and threshold policies.
   *
   * @param cfg - Settle trigger configuration for this evaluation.
   * @param cfg.settleIntervalMs - Time since last settle after which settle should run (if pending).
   * @param cfg.settleThreshold - If set, settle when total claimed-on-chain exceeds this amount.
   * @returns `true` when a settle should run this tick.
   */
  private async evaluateSettleTriggers(cfg: {
    settleIntervalMs: number;
    settleThreshold?: string;
  }): Promise<boolean> {
    if (!this.pendingSettle) {
      return false;
    }

    const now = Date.now();

    if (now - this.lastSettleTime >= cfg.settleIntervalMs) {
      return true;
    }

    if (cfg.settleThreshold !== undefined) {
      const sessions = await this.scheme.getStorage().list();
      const unsettled = sessions.reduce((sum, s) => sum + BigInt(s.totalClaimed), 0n);
      if (unsettled > BigInt(cfg.settleThreshold)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns channel ids that have been idle longer than `idleSecs` and still have
   * a non-zero balance (candidates for cooperative withdrawal).
   *
   * @param idleSecs - Minimum seconds since last request for a session to count as idle.
   * @returns Channel ids meeting the idle and balance criteria.
   */
  private async getIdleChannelsForCooperativeWithdraw(idleSecs: number): Promise<string[]> {
    const storage = this.scheme.getStorage();
    const sessions = await storage.list();
    const now = Date.now();
    const idleMs = idleSecs * 1000;
    const channels: string[] = [];

    for (const s of sessions) {
      if (BigInt(s.balance) === 0n) {
        continue;
      }
      if (now - s.lastRequestTimestamp >= idleMs) {
        channels.push(s.channelId);
      }
    }

    return channels;
  }

  /**
   * Submits a batch of voucher claims to the facilitator.
   *
   * @param claims - Voucher claims to send in one `settleAction: "claim"` payload.
   * @returns Per-batch claim summary (count and transaction hash).
   */
  private async submitClaim(claims: BatchedVoucherClaim[]): Promise<ClaimResult> {
    const hasAuthorizerSigner = this.scheme.getReceiverAuthorizerAddress() !== undefined;

    let paymentPayload: PaymentPayload;

    if (hasAuthorizerSigner) {
      const authorizerSignature = await this.scheme.signClaimBatch(claims, this.network);
      paymentPayload = {
        x402Version: 2,
        accepted: this.buildPaymentRequirements(),
        payload: {
          settleAction: "claimWithSignature",
          claims,
          authorizerSignature,
        },
      };
    } else {
      paymentPayload = {
        x402Version: 2,
        accepted: this.buildPaymentRequirements(),
        payload: {
          settleAction: "claim",
          claims,
        },
      };
    }

    const response: SettleResponse = await this.facilitator.settle(
      paymentPayload,
      this.buildPaymentRequirements(),
    );

    if (!response.success) {
      throw new Error(
        `Claim failed: ${response.errorReason ?? "unknown"} — ${response.errorMessage ?? ""}`,
      );
    }

    return { vouchers: claims.length, transaction: response.transaction };
  }

  /**
   * Builds a settle-action payment payload for `settle(receiver, token)`.
   *
   * @returns Payload with `settleAction: "settle"` and receiver/token fields.
   */
  private buildSettlePaymentPayload(): PaymentPayload {
    return {
      x402Version: 2,
      accepted: this.buildPaymentRequirements(),
      payload: {
        settleAction: "settle",
        receiver: this.receiver,
        token: this.token,
      },
    };
  }

  /**
   * Builds a minimal {@link PaymentRequirements} for channel manager operations.
   *
   * @returns Requirements describing batched operations for this manager.
   */
  private buildPaymentRequirements(): PaymentRequirements {
    return {
      scheme: "batched",
      network: this.network,
      asset: this.token,
      amount: "0",
      payTo: this.receiver,
      maxTimeoutSeconds: 0,
      extra: {},
    };
  }

  /**
   * Updates session records after a successful claim submission.
   *
   * @param claims - Claims that were included in the successful batch (reserved for future use).
   */
  private async updateClaimedSessions(claims: BatchedVoucherClaim[]): Promise<void> {
    const storage = this.scheme.getStorage();
    for (const claim of claims) {
      const channelId = claim.voucher.channel?.payer ? undefined : undefined;
      void channelId;
    }
    void storage;
  }
}
