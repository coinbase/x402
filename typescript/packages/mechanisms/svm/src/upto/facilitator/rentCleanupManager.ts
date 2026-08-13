/**
 * Facilitator-side async rent cleanup for SVM `upto` channels.
 *
 * Driven entirely by verify-time {@link UptoChannelStorage}: each pass lists
 * stored channels, refetches live account status, then acts on whatever is
 * ready (abandon-close / distribute / reclaim). RPC is not used for discovery.
 *
 * Signs with the live channel `payee` / `rent_payer` (same key in this scheme)
 * from the facilitator's existing signer pool — no dedicated cleanup key.
 *
 * Policy note (spec §8): sealing abandoned Open channels before the server
 * settles freezes the watermark and refunds the unsettled remainder to the
 * client. Abandon timing uses `min(expiresAt + grace, firstSeenAt + max)` so
 * normal vouchers expire cleanly while misconfigured long timeouts are capped.
 */

import { address, type Address, type Signature } from "@solana/kit";
import type { Network } from "@x402/core/types";

import { discoverChannelsByRentPayer } from "../../payment-channels/discovery";
import { fetchMaybeChannel, type Channel } from "../../payment-channels/generated/accounts/channel";
import {
  buildDistributeInstruction,
  buildReclaimInstruction,
  buildSettleAndSealInstructions,
  ChannelStatus,
  type ServerInstruction,
} from "../../payment-channels/onchain";
import { OPEN_SLOT_WINDOW } from "../../payment-channels/open";
import type { FacilitatorSigningCapabilities, FacilitatorSvmSigner } from "../../signer";
import { createRpcClient } from "../../utils";
import { SLOT_COMMITMENT, STATE_COMMITMENT } from "../shared";
import type { ChannelRpc, UptoSvmSigner } from "./channel";
import { reclaimComputeUnitLimit, submitSettle } from "./channel";
import type { UptoChannelRecord, UptoChannelStorage } from "./channelStorage";

/** Reclaim work item: storage key plus live rent_payer from the channel account. */
interface ReclaimCandidate {
  channelId: string;
  rentPayer: string;
}

/**
 * Reorders records to start right after the channel id a prior pass stopped
 * at, wrapping around. An unknown or empty cursor (a closed channel, or the
 * first pass) scans from the beginning.
 *
 * @param records - Stored channel records in storage order
 * @param cursor - Channel id to resume from, or "" to scan from the start
 * @returns Records rotated so `cursor` (if present) comes first
 */
function rotateFromCursor(records: UptoChannelRecord[], cursor: string): UptoChannelRecord[] {
  if (!cursor) return records;
  const index = records.findIndex(record => record.channelId === cursor);
  if (index === -1) return records;
  return [...records.slice(index), ...records.slice(0, index)];
}

/** Default grace after voucher expiry before abandon-closing an Open channel. */
export const DEFAULT_ABANDON_GRACE_SECS = 120;

/** Default reclaim instructions per cleanup transaction. */
export const DEFAULT_MAX_RECLAIMS_PER_TX = 8;

/** Default total cleanup transactions submitted per `cleanup` call. */
export const DEFAULT_MAX_TXS_PER_RUN = 20;

/** Default abandon-close (settle+distribute) transactions per `cleanup` call. */
export const DEFAULT_MAX_CLOSES_PER_RUN = 10;

/** Result of a successful abandon-close or Sealed distribute. */
export interface RentCleanupCloseResult {
  channelId: string;
  transaction: string;
  action: "abandon_close" | "distribute";
}

/** Result of a successful reclaim batch transaction. */
export interface RentCleanupReclaimResult {
  channelIds: string[];
  transaction: string;
}

/** Options for one-shot and interval cleanup. */
export interface RentCleanupOptions {
  /** Seconds after `expiresAt` before abandon-close. Default 120. */
  abandonGraceSecs?: number;
  /** Max `reclaim` instructions packed into one transaction. */
  maxReclaimsPerTx?: number;
  /** Max cleanup transactions (closes + reclaim batches) per call. */
  maxTxsPerRun?: number;
  /** Max abandon-close / Sealed-distribute transactions per call. */
  maxClosesPerRun?: number;
  onClose?: (result: RentCleanupCloseResult) => void;
  onReclaim?: (result: RentCleanupReclaimResult) => void;
  onError?: (error: unknown, context?: { channelId?: string }) => void;
}

/** Interval runner configuration. */
export interface RentCleanupStartConfig extends RentCleanupOptions {
  /** Seconds between `cleanup` ticks. Required to start the loop. */
  intervalSecs: number;
}

export interface UptoSvmRentCleanupManagerConfig {
  signer: FacilitatorSvmSigner;
  storage: UptoChannelStorage;
  network: Network;
  rpcUrl?: string;
  /**
   * `SetComputeUnitPrice` (microlamports per compute unit) attached to cleanup
   * transactions; `0` omits the instruction. Defaults to
   * `DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS` (1).
   */
  computeUnitPriceMicroLamports?: number;
  /**
   * `SetComputeUnitLimit` for close/distribute cleanup transactions. Defaults
   * to `DEFAULT_SETTLE_COMPUTE_UNIT_LIMIT` (100k, standard SPL Token
   * settlement); raise it for compute-heavy Token-2022 extension mints.
   * Reclaim batches instead derive their limit per channel
   * (`reclaimComputeUnitLimit`) and are mint-independent.
   */
  settleComputeUnitLimit?: number;
  /** Injected RPC client used instead of building one from `rpcUrl`. */
  rpc?: ChannelRpc;
  /**
   * Add a spec §6 getProgramAccounts sweep, per managed signer key, for
   * Distributed channels missing from storage. Discovery finds only
   * chain-verifiable reclaim candidates; it never substitutes for the
   * payTo/tokenProgram metadata Open/Sealed actions require.
   */
  enableDiscovery?: boolean;
}

/**
 * Storage-driven rent cleanup worker for SVM `upto`.
 *
 * Operators opt in via {@link start} or an external cron calling
 * {@link cleanup}; the facilitator scheme never auto-starts this.
 */
export class UptoSvmRentCleanupManager {
  private readonly signer: FacilitatorSvmSigner;
  private readonly getKitSigner: (feePayer: Address) => FacilitatorSigningCapabilities;
  private readonly storage: UptoChannelStorage;
  private readonly network: Network;
  private readonly rpcUrl: string | undefined;
  private readonly computeUnitPriceMicroLamports: number | undefined;
  private readonly settleComputeUnitLimit: number | undefined;
  private readonly rpc: ChannelRpc | undefined;
  private readonly enableDiscovery: boolean;

  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private tickInFlight = false;
  private startConfig: RentCleanupStartConfig | undefined;

  /**
   * Tail of the queued pass chain. Passes run one at a time so an operator's
   * cron calling {@link cleanup} cannot race the interval loop into submitting
   * the same close or reclaim twice.
   */
  private passQueue: Promise<void> = Promise.resolve();

  /**
   * Resumes scanning where the previous pass's budget ran out, so a
   * persistent close/reclaim backlog larger than maxTxsPerRun cannot starve
   * records ordered later in storage.list() forever. Empty string starts
   * from the beginning. Only ever read/written inside a queued pass.
   */
  private scanCursor = "";

  /**
   * Create a rent cleanup manager for one network.
   *
   * @param config - Signer pool, channel storage, and network/RPC
   */
  constructor(config: UptoSvmRentCleanupManagerConfig) {
    if (typeof config.signer.getSigner !== "function") {
      throw new Error(
        "UptoSvmRentCleanupManager requires getSigner on the signer. " +
          "Use toFacilitatorSvmSigner() which provides all required methods.",
      );
    }
    this.getKitSigner = config.signer.getSigner.bind(config.signer);
    this.signer = config.signer;
    this.storage = config.storage;
    this.network = config.network;
    this.rpcUrl = config.rpcUrl;
    this.computeUnitPriceMicroLamports = config.computeUnitPriceMicroLamports;
    this.settleComputeUnitLimit = config.settleComputeUnitLimit;
    this.rpc = config.rpc;
    this.enableDiscovery = config.enableDiscovery ?? false;
  }

  /**
   * Clean up whatever is ready: abandon-close timed-out Open channels,
   * distribute Sealed ones, batch-reclaim Distributed channels past the
   * open-slot gate. Defers Closing / too-early / still-active Open.
   *
   * @param opts - Work caps and callbacks
   * @returns A promise that resolves when this pass completes
   */
  async cleanup(opts: RentCleanupOptions = {}): Promise<void> {
    const pass = this.passQueue.then(() => this.runPass(opts));
    // Swallow on the queue tail only: the caller still sees its own rejection.
    this.passQueue = pass.catch(() => undefined);
    return pass;
  }

  /**
   * Start an interval loop that calls {@link cleanup}.
   *
   * @param config - Interval and cleanup policy
   */
  start(config: RentCleanupStartConfig): void {
    if (this.running) return;
    this.running = true;
    this.startConfig = config;
    const intervalMs = config.intervalSecs * 1_000;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  /**
   * Stop the interval loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.startConfig = undefined;
  }

  /**
   * Run one cleanup pass. Callers go through {@link cleanup}, which serializes
   * passes.
   *
   * @param opts - Work caps and callbacks
   */
  private async runPass(opts: RentCleanupOptions): Promise<void> {
    const abandonGraceSecs = opts.abandonGraceSecs ?? DEFAULT_ABANDON_GRACE_SECS;
    const maxReclaimsPerTx = opts.maxReclaimsPerTx ?? DEFAULT_MAX_RECLAIMS_PER_TX;
    const maxTxsPerRun = opts.maxTxsPerRun ?? DEFAULT_MAX_TXS_PER_RUN;
    const maxClosesPerRun = opts.maxClosesPerRun ?? DEFAULT_MAX_CLOSES_PER_RUN;

    const rpc = this.rpc ?? createRpcClient(this.network, this.rpcUrl);
    const records = rotateFromCursor(await this.storage.list(), this.scanCursor);
    this.scanCursor = "";
    const nowSecs = Math.floor(Date.now() / 1_000);
    let currentSlot: bigint | undefined;
    let txsUsed = 0;
    let closesUsed = 0;
    const reclaimCandidates: ReclaimCandidate[] = [];
    const seen = new Set<string>();
    const getCurrentSlot = async (): Promise<bigint> => {
      currentSlot ??= await rpc.getSlot({ commitment: SLOT_COMMITMENT }).send();
      return currentSlot;
    };

    for (const record of records) {
      // Stop, not skip: the budget is spent, so nothing further in this pass
      // can act on a record. Resume here next pass instead of always
      // rescanning from the start.
      if (txsUsed >= maxTxsPerRun) {
        this.scanCursor = record.channelId;
        break;
      }
      if (record.network !== this.network) continue;
      seen.add(record.channelId);

      try {
        const maybe = await fetchMaybeChannel(rpc, address(record.channelId), {
          commitment: STATE_COMMITMENT,
        });
        if (!maybe.exists) {
          await this.storage.delete(record.channelId);
          continue;
        }

        const live = maybe.data;
        const status = live.status as ChannelStatus;

        if (status === ChannelStatus.Closing) {
          continue;
        }

        if (status === ChannelStatus.Open || status === ChannelStatus.Sealed) {
          if (status === ChannelStatus.Open) {
            const readyAt = record.expiresAt + abandonGraceSecs;
            if (nowSecs < readyAt) continue;
          }
          // Skip, not stop: later records may be reclaimable, and reclaims are
          // budgeted separately from closes.
          if (closesUsed >= maxClosesPerRun) continue;

          if (!record.payTo) {
            opts.onError?.(new Error(`channel ${record.channelId} missing payTo; skipping`), {
              channelId: record.channelId,
            });
            continue;
          }

          const feePayer = live.payee;
          const feePayerSigner = this.resolveFeePayer(feePayer);
          if (!feePayerSigner) {
            opts.onError?.(
              new Error(
                `channel ${record.channelId} feePayer ${feePayer} not in facilitator signer set`,
              ),
              { channelId: record.channelId },
            );
            continue;
          }

          const signature = await this.submitCloseOrDistribute(
            feePayerSigner,
            rpc,
            record,
            live,
            status,
          );
          closesUsed += 1;
          txsUsed += 1;
          opts.onClose?.({
            channelId: record.channelId,
            transaction: signature,
            action: status === ChannelStatus.Open ? "abandon_close" : "distribute",
          });
          await this.syncStorageAfterAction(rpc, record.channelId);
          continue;
        }

        if (status === ChannelStatus.Distributed) {
          const slot = await getCurrentSlot();
          if (slot > live.openSlot + OPEN_SLOT_WINDOW) {
            reclaimCandidates.push({
              channelId: record.channelId,
              rentPayer: live.rentPayer,
            });
          }
          continue;
        }

        // An unrecognized status has no cleanup path, and the record would
        // otherwise sit in storage forever without the operator knowing.
        opts.onError?.(
          new Error(`channel ${record.channelId} has unrecognized status ${String(status)}`),
          { channelId: record.channelId },
        );
      } catch (error) {
        opts.onError?.(error, { channelId: record.channelId });
      }
    }

    if (this.enableDiscovery) {
      const discovered = await this.discoverReclaimCandidates(rpc, getCurrentSlot, seen, opts);
      reclaimCandidates.push(...discovered);
    }

    await this.submitReclaimBatches(rpc, reclaimCandidates, {
      maxReclaimsPerTx,
      maxTxsPerRun,
      onReclaim: opts.onReclaim,
      onError: opts.onError,
    });
  }

  /**
   * Run the spec §6 onchain sweep for every managed signer key and return
   * Distributed, slot-gated channels absent from storage. Recovery path for
   * a lost or incomplete work index; only ever proposes the reclaim action,
   * which needs no offchain metadata.
   *
   * @param rpc - RPC client
   * @param getCurrentSlot - Lazily-fetched, cached current slot
   * @param seen - Channel ids already classified from stored records
   * @param opts - Callbacks for reporting discovery failures
   * @returns Discovered Distributed channels past the open-slot gate
   */
  private async discoverReclaimCandidates(
    rpc: ChannelRpc,
    getCurrentSlot: () => Promise<bigint>,
    seen: Set<string>,
    opts: RentCleanupOptions,
  ): Promise<ReclaimCandidate[]> {
    const candidates: ReclaimCandidate[] = [];
    for (const managed of this.signer.getAddresses()) {
      let found;
      try {
        found = await discoverChannelsByRentPayer(rpc, managed);
      } catch (error) {
        opts.onError?.(error);
        continue;
      }
      const slot = await getCurrentSlot();
      for (const { channelId, channel } of found) {
        if (seen.has(channelId)) continue;
        seen.add(channelId);
        if (channel.status !== ChannelStatus.Distributed) continue;
        if (slot <= channel.openSlot + OPEN_SLOT_WINDOW) continue;
        candidates.push({ channelId, rentPayer: channel.rentPayer });
      }
    }
    return candidates;
  }

  /**
   * Interval tick. Skips while a tick is outstanding so a pass slower than the
   * interval cannot pile up queued passes.
   */
  private async tick(): Promise<void> {
    if (!this.running || this.tickInFlight || !this.startConfig) return;
    this.tickInFlight = true;
    try {
      await this.cleanup(this.startConfig);
    } catch (error) {
      this.startConfig.onError?.(error);
    } finally {
      this.tickInFlight = false;
    }
  }

  /**
   * Submit settle_and_seal(has_voucher=0)+distribute for Open, or distribute
   * alone for Sealed.
   *
   * @param feePayerSigner - Channel feePayer / payee signer
   * @param rpc - RPC client
   * @param record - Stored channel (must include payTo + tokenProgram)
   * @param live - Refetched channel account
   * @param status - Live status that selected this path
   * @returns Broadcast signature
   */
  private async submitCloseOrDistribute(
    feePayerSigner: UptoSvmSigner,
    rpc: ChannelRpc,
    record: UptoChannelRecord,
    live: Channel,
    status: ChannelStatus,
  ): Promise<Signature> {
    const splits = [{ bps: 10_000, recipient: record.payTo }];
    const distribute = await buildDistributeInstruction({
      channelId: record.channelId,
      mint: live.mint,
      network: this.network,
      payee: live.payee,
      payer: live.payer,
      rentPayer: live.rentPayer,
      splits,
      tokenProgram: record.tokenProgram,
    });

    const instructions: ServerInstruction[] =
      status === ChannelStatus.Open
        ? [
            ...buildSettleAndSealInstructions({
              channelId: record.channelId,
              payeeSigner: feePayerSigner,
            }),
            distribute,
          ]
        : [distribute];

    return submitSettle(feePayerSigner, rpc, instructions, {
      computeUnitLimit: this.settleComputeUnitLimit,
      computeUnitPriceMicroLamports: this.computeUnitPriceMicroLamports,
    });
  }

  /**
   * After a close/distribute, delete the storage entry if the PDA is gone.
   *
   * @param rpc - RPC client
   * @param channelId - Channel PDA
   */
  private async syncStorageAfterAction(rpc: ChannelRpc, channelId: string): Promise<void> {
    const maybe = await fetchMaybeChannel(rpc, address(channelId), {
      commitment: STATE_COMMITMENT,
    });
    if (!maybe.exists) {
      await this.storage.delete(channelId);
    }
  }

  /**
   * Group reclaim candidates by rent_payer and run each group's batched
   * reclaim transactions concurrently, each against its own maxTxsPerRun
   * budget.
   *
   * Submissions within a group stay sequential (each batch refetches live
   * state, so a group depends on its own prior submissions to avoid
   * double-reclaiming), but independent rent-payer groups do not share a
   * budget or depend on one another: adding managed signer keys adds
   * maxTxsPerRun more reclaim throughput per pass, not a share of a fixed
   * pool.
   *
   * @param rpc - RPC client
   * @param candidates - Distributed channels ready to reclaim
   * @param opts - Batch size, tx budget, callbacks
   * @param opts.maxReclaimsPerTx - Max reclaim instructions per transaction
   * @param opts.maxTxsPerRun - Max reclaim transactions per rent-payer group
   * @param opts.onReclaim - Optional success callback per reclaim batch
   * @param opts.onError - Optional error callback
   */
  private async submitReclaimBatches(
    rpc: ChannelRpc,
    candidates: ReclaimCandidate[],
    opts: {
      maxReclaimsPerTx: number;
      maxTxsPerRun: number;
      onReclaim?: ((result: RentCleanupReclaimResult) => void) | undefined;
      onError?: ((error: unknown, context?: { channelId?: string }) => void) | undefined;
    },
  ): Promise<void> {
    if (opts.maxTxsPerRun <= 0 || candidates.length === 0) return;

    const byRentPayer = new Map<string, ReclaimCandidate[]>();
    for (const candidate of candidates) {
      const group = byRentPayer.get(candidate.rentPayer) ?? [];
      group.push(candidate);
      byRentPayer.set(candidate.rentPayer, group);
    }

    await Promise.all(
      Array.from(byRentPayer.entries()).map(([rentPayer, group]) =>
        this.submitReclaimGroup(rpc, rentPayer, group, opts, { remaining: opts.maxTxsPerRun }),
      ),
    );
  }

  /**
   * Submit one rent payer's reclaim batches sequentially, claiming a slot
   * from the shared budget before each attempt.
   *
   * @param rpc - RPC client
   * @param rentPayer - Rent payer this group's channels share
   * @param group - This rent payer's reclaim candidates
   * @param opts - Batch size and callbacks
   * @param opts.maxReclaimsPerTx - Max reclaim instructions per transaction
   * @param opts.onReclaim - Optional success callback per reclaim batch
   * @param opts.onError - Optional error callback
   * @param budget - Shared remaining-transaction counter across all groups
   * @param budget.remaining - Transactions left to submit across all groups
   */
  private async submitReclaimGroup(
    rpc: ChannelRpc,
    rentPayer: string,
    group: ReclaimCandidate[],
    opts: {
      maxReclaimsPerTx: number;
      onReclaim?: ((result: RentCleanupReclaimResult) => void) | undefined;
      onError?: ((error: unknown, context?: { channelId?: string }) => void) | undefined;
    },
    budget: { remaining: number },
  ): Promise<void> {
    const feePayerSigner = this.resolveFeePayer(rentPayer);
    if (!feePayerSigner) {
      for (const candidate of group) {
        opts.onError?.(
          new Error(
            `channel ${candidate.channelId} feePayer ${rentPayer} not in facilitator signer set`,
          ),
          { channelId: candidate.channelId },
        );
      }
      return;
    }

    for (let i = 0; i < group.length; i += opts.maxReclaimsPerTx) {
      if (budget.remaining <= 0) return;
      budget.remaining -= 1;

      const batch = group.slice(i, i + opts.maxReclaimsPerTx);
      try {
        // Refetch each account immediately before acting (stale → skip).
        const liveBatch: ReclaimCandidate[] = [];
        for (const candidate of batch) {
          const maybe = await fetchMaybeChannel(rpc, address(candidate.channelId), {
            commitment: STATE_COMMITMENT,
          });
          if (!maybe.exists) {
            await this.storage.delete(candidate.channelId);
            continue;
          }
          if (maybe.data.status !== ChannelStatus.Distributed) continue;
          liveBatch.push({
            channelId: candidate.channelId,
            rentPayer: maybe.data.rentPayer,
          });
        }
        if (liveBatch.length === 0) continue;

        const instructions = liveBatch.map(candidate =>
          buildReclaimInstruction({
            channelId: candidate.channelId,
            rentPayer: candidate.rentPayer,
          }),
        );
        const signature = await submitSettle(feePayerSigner, rpc, instructions, {
          computeUnitLimit: reclaimComputeUnitLimit(liveBatch.length),
          computeUnitPriceMicroLamports: this.computeUnitPriceMicroLamports,
        });
        opts.onReclaim?.({
          channelIds: liveBatch.map(c => c.channelId),
          transaction: signature,
        });
        for (const candidate of liveBatch) {
          await this.storage.delete(candidate.channelId);
        }
      } catch (error) {
        // Every channel in the batch is stuck, not just the first.
        for (const candidate of batch) {
          opts.onError?.(error, { channelId: candidate.channelId });
        }
      }
    }
  }

  /**
   * Resolve the facilitator signer for a channel payee / rent_payer.
   *
   * @param feePayerAddress - Live channel payee / rent_payer
   * @returns Matching signer, or undefined when not configured
   */
  private resolveFeePayer(feePayerAddress: string): UptoSvmSigner | undefined {
    if (!this.signer.getAddresses().includes(feePayerAddress as Address)) {
      return undefined;
    }
    return this.getKitSigner(feePayerAddress as Address);
  }
}
