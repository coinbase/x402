/**
 * Client-side subchannel session fields mirrored from PAYMENT-RESPONSE / recovery flows.
 */
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
  /** Latest client-signed cumulative cap (after corrective recovery, optional) */
  signedCumulativeAmount?: string;
  /** Client voucher signature for {@link signedCumulativeAmount} (optional) */
  signature?: `0x${string}`;
}

export interface ClientSessionStorage {
  get(key: string): Promise<DeferredClientContext | undefined>;
  set(key: string, context: DeferredClientContext): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Default in-memory {@link ClientSessionStorage} (sessions do not survive process restart).
 */
export class InMemoryClientSessionStorage implements ClientSessionStorage {
  private sessions = new Map<string, DeferredClientContext>();

  /**
   * Returns the session for `key` if present.
   *
   * @param key - Session storage key (e.g. derived from service id).
   * @returns Persisted context or undefined.
   */
  async get(key: string): Promise<DeferredClientContext | undefined> {
    return this.sessions.get(key);
  }

  /**
   * Stores or replaces the session for `key`.
   *
   * @param key - Session storage key.
   * @param context - Subchannel fields to persist.
   * @returns Resolves when stored.
   */
  async set(key: string, context: DeferredClientContext): Promise<void> {
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
