import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { FacilitatorClient } from "@x402/core/server";
import type { DeferredVoucherClaim } from "../types";
import type { DeferredEvmScheme } from "./scheme";

export interface SettlementManagerConfig {
  scheme: DeferredEvmScheme;
  facilitator: FacilitatorClient;
  serviceId: `0x${string}`;
  network: Network;
  payTo: `0x${string}`;
  asset: `0x${string}`;
}

export interface AutoSettlementConfig {
  /** Periodic claim interval in seconds (default: 60). */
  claimIntervalSecs?: number;
  /** Claim payers idle longer than N seconds. */
  claimOnIdleSecs?: number;
  /** Claim when total claimable exceeds this threshold (atomic token units). */
  claimThreshold?: string;
  /** Immediately claim when a withdrawal request is detected (default: true). */
  claimOnWithdrawal?: boolean;

  /** Periodic settle interval in seconds (default: 300). */
  settleIntervalSecs?: number;
  /** Settle when unsettled (claimed but not transferred) exceeds threshold (atomic token units). */
  settleThreshold?: string;

  /** Max voucher claims per batch transaction (default: 50). */
  maxClaimsPerBatch?: number;
  /** Background tick evaluation interval in seconds (default: 5). */
  tickSecs?: number;

  /** Called after a successful claim batch. */
  onClaim?: (result: ClaimResult) => void;
  /** Called after a successful settle. */
  onSettle?: (result: SettleResult) => void;
  /** Called on any claim/settle error. */
  onError?: (error: unknown) => void;
}

export interface ClaimResult {
  vouchers: number;
  transaction: string;
}

export interface SettleResult {
  transaction: string;
}

/**
 * Aggregates deferred voucher sessions and submits batched claim/settle
 * operations to the facilitator. Supports configurable background policies.
 */
export class DeferredSettlementManager {
  private readonly scheme: DeferredEvmScheme;
  private readonly facilitator: FacilitatorClient;
  private readonly serviceId: `0x${string}`;
  private readonly network: Network;
  private readonly payTo: `0x${string}`;
  private readonly asset: `0x${string}`;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastClaimTime = 0;
  private lastSettleTime = 0;
  private pendingSettle = false;
  private running = false;

  /**
   * Creates a manager bound to a deferred scheme, facilitator, and settlement context.
   *
   * @param config - Scheme, facilitator client, and on-chain addressing fields.
   */
  constructor(config: SettlementManagerConfig) {
    this.scheme = config.scheme;
    this.facilitator = config.facilitator;
    this.serviceId = config.serviceId;
    this.network = config.network;
    this.payTo = config.payTo;
    this.asset = config.asset;
  }

  /**
   * Claims all vouchers where `chargedCumulativeAmount > totalClaimed`.
   * Splits into batches of `maxClaimsPerBatch` if needed.
   * Updates each claimed session's `totalClaimed` in storage after success.
   *
   * @param opts - Optional claim tuning.
   * @param opts.maxClaimsPerBatch - Max claims per facilitator batch (default 50).
   * @param opts.idleSecs - If set, only claim payers idle at least this long.
   * @returns One result per batch submitted successfully.
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
   * Submits a settle transaction to transfer all claimed-but-unsettled funds
   * to the service's `payTo` address.
   *
   * @returns Facilitator transaction identifier for the settle call.
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
   * Convenience: claims all outstanding vouchers then settles.
   *
   * @param opts - Optional claim batching; passed through to {@link claim}.
   * @param opts.maxClaimsPerBatch - Max claims per batch when claiming.
   * @returns Claim batch results and settle result when any claim ran.
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
   * Starts a single background timer that evaluates all settlement policies each tick.
   *
   * @param config - Intervals, thresholds, hooks, and batch limits for auto claim/settle.
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

    this.tickTimer = setInterval(() => {
      void this.tick({
        claimIntervalMs,
        settleIntervalMs,
        claimOnIdleSecs: config.claimOnIdleSecs,
        claimThreshold: config.claimThreshold,
        claimOnWithdrawal,
        settleThreshold: config.settleThreshold,
        maxClaimsPerBatch,
        onClaim: config.onClaim,
        onSettle: config.onSettle,
        onError: config.onError,
      });
    }, tickMs);
  }

  /**
   * Stops the background tick timer.
   * With `flush: true`, performs a final claimAndSettle before returning.
   *
   * @param opts - Stop behavior options.
   * @param opts.flush - When true, runs one last claim-and-settle pass.
   */
  async stop(opts?: { flush?: boolean }): Promise<void> {
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (opts?.flush) {
      await this.claimAndSettle();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal tick logic
  // ---------------------------------------------------------------------------

  /**
   * Single background tick: may claim and/or settle according to policy.
   *
   * @param cfg - Resolved intervals, thresholds, callbacks, and batch size from {@link start}.
   * @param cfg.claimIntervalMs - Minimum milliseconds between automatic claims.
   * @param cfg.settleIntervalMs - Minimum milliseconds between automatic settles.
   * @param cfg.claimOnIdleSecs - When set, idle-based claim trigger threshold in seconds.
   * @param cfg.claimThreshold - When set, claim when total claimable exceeds this amount.
   * @param cfg.claimOnWithdrawal - Whether withdrawal-pending sessions trigger claims.
   * @param cfg.settleThreshold - When set, settle when unsettled total exceeds this amount.
   * @param cfg.maxClaimsPerBatch - Batch size passed to {@link claim}.
   * @param cfg.onClaim - Hook after each successful claim batch.
   * @param cfg.onSettle - Hook after a successful settle.
   * @param cfg.onError - Hook for claim or settle errors.
   * @returns Resolves when this tick's claim and settle attempts finish.
   */
  private async tick(cfg: {
    claimIntervalMs: number;
    settleIntervalMs: number;
    claimOnIdleSecs?: number;
    claimThreshold?: string;
    claimOnWithdrawal: boolean;
    settleThreshold?: string;
    maxClaimsPerBatch: number;
    onClaim?: (result: ClaimResult) => void;
    onSettle?: (result: SettleResult) => void;
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
  }

  /**
   * Whether the current policy warrants an automatic claim on this tick.
   *
   * @param cfg - Claim trigger configuration from the background tick.
   * @param cfg.claimIntervalMs - Minimum milliseconds since last claim.
   * @param cfg.claimOnIdleSecs - Optional idle-seconds threshold for claimable payers.
   * @param cfg.claimThreshold - Optional min total claimable to trigger.
   * @param cfg.claimOnWithdrawal - Whether matched withdrawal-pending payers trigger claim.
   * @returns True if a claim should run now.
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
      const total = allClaims.reduce((sum, c) => sum + BigInt(c.claimAmount) - BigInt(0), 0n);
      if (total > BigInt(cfg.claimThreshold)) {
        return true;
      }
    }

    if (cfg.claimOnWithdrawal) {
      const withdrawals = await this.scheme.getWithdrawalPendingSessions();
      if (withdrawals.length > 0) {
        const claimableWithdrawals = await this.scheme.getClaimableVouchers();
        const withdrawalPayers = new Set(withdrawals.map(w => w.payer.toLowerCase()));
        if (claimableWithdrawals.some(c => withdrawalPayers.has(c.payer.toLowerCase()))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Whether the current policy warrants an automatic settle on this tick.
   *
   * @param cfg - Settle trigger configuration from the background tick.
   * @param cfg.settleIntervalMs - Minimum milliseconds since last settle.
   * @param cfg.settleThreshold - Optional min unsettled total to trigger early.
   * @returns True if a settle should run now.
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
      const sessions = await this.scheme
        .getStorage()
        .list(this.scheme.getServiceId().toLowerCase());
      const unsettled = sessions.reduce((sum, s) => sum + BigInt(s.totalClaimed) - BigInt(0), 0n);
      if (unsettled > BigInt(cfg.settleThreshold)) {
        return true;
      }
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Facilitator payload construction
  // ---------------------------------------------------------------------------

  /**
   * Submits one claim batch to the facilitator and returns the facilitator response summary.
   *
   * @param claims - Voucher claims to include in this settle/claim request.
   * @returns Count of vouchers claimed and the facilitator transaction id.
   */
  private async submitClaim(claims: DeferredVoucherClaim[]): Promise<ClaimResult> {
    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      accepted: this.buildPaymentRequirements(),
      payload: {
        settleAction: "claim",
        serviceId: this.serviceId,
        claims,
      },
    };

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
   * Builds the payment payload for the deferred settle (not claim) facilitator call.
   *
   * @returns Payload with `settleAction: "settle"` and this service id.
   */
  private buildSettlePaymentPayload(): PaymentPayload {
    return {
      x402Version: 2,
      accepted: this.buildPaymentRequirements(),
      payload: {
        settleAction: "settle",
        serviceId: this.serviceId,
      },
    };
  }

  /**
   * Builds minimal deferred {@link PaymentRequirements} for facilitator claim/settle calls.
   *
   * @returns Requirements sharing network, asset, payTo, and service id.
   */
  private buildPaymentRequirements(): PaymentRequirements {
    return {
      scheme: "deferred",
      network: this.network,
      asset: this.asset,
      amount: "0",
      payTo: this.payTo,
      maxTimeoutSeconds: 0,
      extra: { serviceId: this.serviceId },
    };
  }

  // ---------------------------------------------------------------------------
  // Post-claim session bookkeeping
  // ---------------------------------------------------------------------------

  /**
   * Updates each session's `totalClaimed` in storage after a successful claim batch.
   *
   * @param claims - Claims that were submitted and accepted for this batch.
   * @returns Resolves when storage writes complete.
   */
  private async updateClaimedSessions(claims: DeferredVoucherClaim[]): Promise<void> {
    const storage = this.scheme.getStorage();
    const sid = this.scheme.getServiceId().toLowerCase();

    for (const claim of claims) {
      const session = await storage.get(sid, claim.payer);
      if (!session) {
        continue;
      }
      await storage.set(sid, claim.payer, {
        ...session,
        totalClaimed: claim.claimAmount,
      });
    }
  }
}
