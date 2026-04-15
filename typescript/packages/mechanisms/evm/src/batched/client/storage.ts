/**
 * Client-side channel session fields mirrored from PAYMENT-RESPONSE / recovery flows.
 */
export interface BatchedClientContext {
  /** Current cumulative amount charged by the server for this channel */
  chargedCumulativeAmount?: string;
  /** Current on-chain channel balance */
  balance?: string;
  /** Total claimed on-chain */
  totalClaimed?: string;
  /** Amount to deposit (only for deposit payloads) */
  depositAmount?: string;
  /** Latest client-signed maxClaimableAmount cap (after corrective recovery, optional) */
  signedMaxClaimable?: string;
  /** Client voucher signature for {@link signedMaxClaimable} (optional) */
  signature?: `0x${string}`;
}

export interface ClientSessionStorage {
  get(key: string): Promise<BatchedClientContext | undefined>;
  set(key: string, context: BatchedClientContext): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Default in-memory {@link ClientSessionStorage} (sessions do not survive process restart).
 */
export class InMemoryClientSessionStorage implements ClientSessionStorage {
  private sessions = new Map<string, BatchedClientContext>();

  /**
   * Returns the session for `key` if present.
   *
   * @param key - Session storage key (channelId).
   * @returns Persisted context or undefined.
   */
  async get(key: string): Promise<BatchedClientContext | undefined> {
    return this.sessions.get(key);
  }

  /**
   * Stores or replaces the session for `key`.
   *
   * @param key - Session storage key.
   * @param context - Channel fields to persist.
   * @returns Resolves when stored.
   */
  async set(key: string, context: BatchedClientContext): Promise<void> {
    this.sessions.set(key, context);
  }

  /**
   * Removes the session for `key` if it exists.
   *
   * @param key - Session storage key.
   * @returns Resolves when removed.
   */
  async delete(key: string): Promise<void> {
    this.sessions.delete(key);
  }
}
