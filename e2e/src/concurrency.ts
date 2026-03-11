/**
 * Concurrency utilities for parallel E2E test execution.
 *
 * - Semaphore: bounds how many combos run at once.
 * - SlotPool: manages N numbered key-pair slots so up to N tests of the same
 *   protocol family can run concurrently without nonce collisions (each slot
 *   maps to a unique key pair).
 * - FamilyLanePool: maintains one SlotPool per protocol family so EVM, SVM,
 *   APTOS and STELLAR work can proceed independently.
 */

import type { ProtocolFamily } from './types';

/**
 * Counting semaphore that limits concurrent async operations.
 */
export class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return () => this.release();
    }

    return new Promise<() => void>((resolve) => {
      this.waiters.push(() => {
        this.permits--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.permits++;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }
}

/**
 * Pool of numbered key-pair slots. Each slot has a unique index that maps
 * to a specific client key and facilitator instance. Callers acquire a slot
 * before running a test combo and release it when done.
 *
 * With N slots, up to N combos can run concurrently.
 * With 1 slot (default / no plural keys), behaviour is fully sequential.
 */
export class SlotPool {
  private available: number[];
  private waiters: Array<(slot: number) => void> = [];

  constructor(slotCount: number) {
    this.available = Array.from({ length: slotCount }, (_, i) => i);
  }

  async acquire(): Promise<{ slotIndex: number; release: () => void }> {
    if (this.available.length > 0) {
      const slotIndex = this.available.shift()!;
      return { slotIndex, release: () => this.releaseSlot(slotIndex) };
    }
    return new Promise((resolve) => {
      this.waiters.push((slot) => {
        resolve({ slotIndex: slot, release: () => this.releaseSlot(slot) });
      });
    });
  }

  private releaseSlot(slotIndex: number): void {
    const next = this.waiters.shift();
    if (next) {
      next(slotIndex);
    } else {
      this.available.push(slotIndex);
    }
  }
}

/**
 * Per-family lane pool: each protocol family gets its own SlotPool sized
 * by that family's key count, so EVM/SVM/APTOS/STELLAR run independently.
 */
export class FamilyLanePool {
  private pools: Map<ProtocolFamily, SlotPool>;

  constructor(laneCounts: Record<ProtocolFamily, number>) {
    this.pools = new Map();
    for (const [family, count] of Object.entries(laneCounts) as [ProtocolFamily, number][]) {
      this.pools.set(family, new SlotPool(Math.max(count, 1)));
    }
  }

  async acquire(family: ProtocolFamily): Promise<{ slotIndex: number; release: () => void }> {
    const pool = this.pools.get(family);
    if (!pool) {
      return { slotIndex: 0, release: () => {} };
    }
    return pool.acquire();
  }
}
