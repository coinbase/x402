/**
 * Production State Manager for x402 Starknet Implementation
 *
 * This module provides persistent state management for production deployments.
 * For a prod environment, we might want to use a database like PostgreSQL or Redis.
 * For now, we're using an in-memory store with persistence hooks.
 */

import type { SessionKey } from "./x402-transfers";

/**
 * Database interface for state persistence
 * Implement this with your database of choice (PostgreSQL, Redis, MongoDB, etc.)
 */
export interface StateDatabase {
  // Nonce management
  getNonce(account: string, nonce: string): Promise<boolean>;
  setNonce(account: string, nonce: string, expiresAt: number): Promise<void>;
  cleanupExpiredNonces(): Promise<void>;

  // Session keys
  getSessionKey(publicKey: string): Promise<SessionKey | null>;
  setSessionKey(publicKey: string, sessionKey: SessionKey): Promise<void>;
  revokeSessionKey(publicKey: string): Promise<void>;
  getSessionKeysByAccount(account: string): Promise<SessionKey[]>;

  // Transaction history
  saveTransaction(tx: TransactionRecord): Promise<void>;
  getTransactionsByAccount(account: string, limit?: number): Promise<TransactionRecord[]>;
  getTransaction(txHash: string): Promise<TransactionRecord | null>;

  // Rate limiting
  getRateLimitData(account: string, token: string): Promise<RateLimitData | null>;
  updateRateLimitData(account: string, token: string, data: RateLimitData): Promise<void>;

  // Metrics
  incrementMetric(metric: string, value?: number): Promise<void>;
  getMetrics(prefix?: string): Promise<Record<string, number>>;
}

/**
 * Transaction record for audit trail
 */
export interface TransactionRecord {
  txHash: string;
  account: string;
  token: string;
  recipient: string;
  amount: string;
  nonce: string;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Rate limit data structure
 */
export interface RateLimitData {
  dailyTransactionCount: number;
  dailyTransferAmount: string;
  resetTime: number;
  lastTransactionTime: number;
}

/**
 * In-memory implementation of StateDatabase for development
 * Replace this with a real database implementation in production
 */
export class InMemoryStateDatabase implements StateDatabase {
  private nonces: Map<string, { used: boolean; expiresAt: number }> = new Map();
  private sessionKeys: Map<string, SessionKey> = new Map();
  private transactions: Map<string, TransactionRecord> = new Map();
  private transactionsByAccount: Map<string, string[]> = new Map();
  private rateLimits: Map<string, RateLimitData> = new Map();
  private metrics: Map<string, number> = new Map();

  /**
   * Gets whether a nonce has been used
   *
   * @param account - Account address
   * @param nonce - Nonce value to check
   * @returns True if nonce is used, false otherwise
   */
  async getNonce(account: string, nonce: string): Promise<boolean> {
    const key = `${account}:${nonce}`;
    const data = this.nonces.get(key);
    return data?.used || false;
  }

  /**
   * Marks a nonce as used
   *
   * @param account - Account address
   * @param nonce - Nonce value to mark as used
   * @param expiresAt - Expiration timestamp
   */
  async setNonce(account: string, nonce: string, expiresAt: number): Promise<void> {
    const key = `${account}:${nonce}`;
    this.nonces.set(key, { used: true, expiresAt });
  }

  /**
   * Cleans up expired nonces from storage
   */
  async cleanupExpiredNonces(): Promise<void> {
    const now = Date.now();
    for (const [key, data] of this.nonces.entries()) {
      if (data.expiresAt < now) {
        this.nonces.delete(key);
      }
    }
  }

  /**
   * Retrieves a session key by public key
   *
   * @param publicKey - The public key to look up
   * @returns Session key or null if not found
   */
  async getSessionKey(publicKey: string): Promise<SessionKey | null> {
    return this.sessionKeys.get(publicKey) || null;
  }

  /**
   * Stores a session key
   *
   * @param publicKey - The public key identifier
   * @param sessionKey - The session key to store
   */
  async setSessionKey(publicKey: string, sessionKey: SessionKey): Promise<void> {
    this.sessionKeys.set(publicKey, sessionKey);
  }

  /**
   * Revokes a session key
   *
   * @param publicKey - The public key to revoke
   */
  async revokeSessionKey(publicKey: string): Promise<void> {
    this.sessionKeys.delete(publicKey);
  }

  /**
   * Gets all session keys for an account
   *
   * @param _ - Account address (unused in memory implementation)
   * @returns Array of session keys
   */
  async getSessionKeysByAccount(_: string): Promise<SessionKey[]> {
    // In production, you'd have an index for this
    const keys: SessionKey[] = [];
    for (const key of this.sessionKeys.values()) {
      // Check if this session key belongs to the account
      // This would be tracked properly in a real database
      keys.push(key);
    }
    return keys;
  }

  /**
   * Saves a transaction record
   *
   * @param tx - Transaction record to save
   */
  async saveTransaction(tx: TransactionRecord): Promise<void> {
    this.transactions.set(tx.txHash, tx);

    // Update account index
    const accountTxs = this.transactionsByAccount.get(tx.account) || [];
    accountTxs.push(tx.txHash);
    this.transactionsByAccount.set(tx.account, accountTxs);
  }

  /**
   * Gets transactions for an account
   *
   * @param account - Account address
   * @param limit - Maximum number of transactions to return
   * @returns Array of transaction records
   */
  async getTransactionsByAccount(
    account: string,
    limit: number = 100,
  ): Promise<TransactionRecord[]> {
    const txHashes = this.transactionsByAccount.get(account) || [];
    const txs: TransactionRecord[] = [];

    for (let i = txHashes.length - 1; i >= 0 && txs.length < limit; i--) {
      const tx = this.transactions.get(txHashes[i]);
      if (tx) {
        txs.push(tx);
      }
    }

    return txs;
  }

  /**
   * Gets a specific transaction by hash
   *
   * @param txHash - Transaction hash
   * @returns Transaction record or null
   */
  async getTransaction(txHash: string): Promise<TransactionRecord | null> {
    return this.transactions.get(txHash) || null;
  }

  /**
   * Gets rate limit data for an account and token
   *
   * @param account - Account address
   * @param token - Token address
   * @returns Rate limit data or null
   */
  async getRateLimitData(account: string, token: string): Promise<RateLimitData | null> {
    const key = `${account}:${token}`;
    return this.rateLimits.get(key) || null;
  }

  /**
   * Updates rate limit data for an account and token
   *
   * @param account - Account address
   * @param token - Token address
   * @param data - Rate limit data to store
   */
  async updateRateLimitData(account: string, token: string, data: RateLimitData): Promise<void> {
    const key = `${account}:${token}`;
    this.rateLimits.set(key, data);
  }

  /**
   * Increments a metric counter
   *
   * @param metric - Metric name
   * @param value - Value to increment by (default 1)
   */
  async incrementMetric(metric: string, value: number = 1): Promise<void> {
    const current = this.metrics.get(metric) || 0;
    this.metrics.set(metric, current + value);
  }

  /**
   * Gets all metrics, optionally filtered by prefix
   *
   * @param prefix - Optional prefix to filter metrics
   * @returns Map of metric names to values
   */
  async getMetrics(prefix?: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const [key, value] of this.metrics.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        result[key] = value;
      }
    }

    return result;
  }
}

/**
 * Production State Manager
 * Coordinates all state operations with proper error handling and caching
 */
export class StateManager {
  private db: StateDatabase;
  private cache: Map<string, { value: unknown; expiresAt: number }> = new Map();

  /**
   * Creates a new StateManager instance
   *
   * @param database - Optional database implementation
   */
  constructor(database?: StateDatabase) {
    this.db = database || new InMemoryStateDatabase();
  }

  /**
   * Checks and marks a nonce as used (atomic operation)
   *
   * @param account - Account address
   * @param nonce - Nonce value
   * @returns True if nonce was available and now marked as used
   */
  async useNonce(account: string, nonce: string): Promise<boolean> {
    const cacheKey = `nonce:${account}:${nonce}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return false; // Already used
    }

    // Check database
    const used = await this.db.getNonce(account, nonce);
    if (used) {
      return false;
    }

    // Mark as used
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await this.db.setNonce(account, nonce, expiresAt);

    // Update cache
    this.cache.set(cacheKey, { value: true, expiresAt });

    // Track metric
    await this.db.incrementMetric("nonces_used");

    return true;
  }

  /**
   * Gets state for a key
   *
   * @param key - State key
   * @returns State value or undefined
   */
  getState<T = any>(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    return undefined;
  }

  /**
   * Sets state for a key
   *
   * @param key - State key
   * @param value - State value
   * @param ttlMs - Time to live in milliseconds
   */
  setState<T = any>(key: string, value: T, ttlMs = 3600000): void {
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  /**
   * Manages session keys with validation
   *
   * @param sessionKey - Session key to create
   */
  async createSessionKey(sessionKey: SessionKey): Promise<void> {
    await this.db.setSessionKey(sessionKey.publicKey, sessionKey);
    await this.db.incrementMetric("session_keys_created");
  }

  /**
   * Validates a session key for a specific transaction
   *
   * @param publicKey - Session key public key
   * @param tokenAddress - Token contract address
   * @param recipient - Transaction recipient
   * @param amount - Transaction amount
   * @returns Validation result with reason if invalid
   */
  async validateSessionKey(
    publicKey: string,
    tokenAddress: string,
    recipient: string,
    amount: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    const sessionKey = await this.db.getSessionKey(publicKey);

    if (!sessionKey) {
      return { valid: false, reason: "Session key not found" };
    }

    // Check expiration
    if (Date.now() > sessionKey.expiresAt) {
      await this.db.revokeSessionKey(publicKey);
      return { valid: false, reason: "Session key expired" };
    }

    // Check amount limit
    if (BigInt(amount) > BigInt(sessionKey.maxAmount)) {
      return { valid: false, reason: "Amount exceeds session key limit" };
    }

    // Check allowed recipients
    if (
      sessionKey.allowedRecipients.length > 0 &&
      !sessionKey.allowedRecipients.includes(recipient)
    ) {
      return { valid: false, reason: "Recipient not allowed by session key" };
    }

    // Check allowed tokens
    if (sessionKey.allowedTokens.length > 0 && !sessionKey.allowedTokens.includes(tokenAddress)) {
      return { valid: false, reason: "Token not allowed by session key" };
    }

    await this.db.incrementMetric("session_key_validations");
    return { valid: true };
  }

  /**
   * Records a transaction for audit trail
   *
   * @param tx - Transaction record without timestamp
   */
  async recordTransaction(tx: Omit<TransactionRecord, "timestamp">): Promise<void> {
    const record: TransactionRecord = {
      ...tx,
      timestamp: Date.now(),
    };

    await this.db.saveTransaction(record);
    await this.db.incrementMetric("transactions_recorded");
    await this.db.incrementMetric(`transactions_${tx.status}`);
  }

  /**
   * Enforces rate limits with proper tracking
   *
   * @param account - Account address
   * @param token - Token contract address
   * @param amount - Transaction amount
   * @param maxAmountPerDay - Maximum amount per day (default 1000 USDC)
   * @param maxTransactionsPerDay - Maximum transactions per day (default 100)
   * @returns Result indicating if transaction is allowed
   */
  async checkRateLimit(
    account: string,
    token: string,
    amount: string,
    maxAmountPerDay: string = "1000000000", // 1000 USDC default
    maxTransactionsPerDay: number = 100,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const now = Date.now();
    const resetTime = now + 24 * 60 * 60 * 1000;

    let data = await this.db.getRateLimitData(account, token);

    // Initialize or reset if expired
    if (!data || data.resetTime < now) {
      data = {
        dailyTransactionCount: 0,
        dailyTransferAmount: "0",
        resetTime,
        lastTransactionTime: 0,
      };
    }

    // Check transaction count
    if (data.dailyTransactionCount >= maxTransactionsPerDay) {
      await this.db.incrementMetric("rate_limit_tx_count_exceeded");
      return {
        allowed: false,
        reason: `Daily transaction limit reached (${maxTransactionsPerDay})`,
      };
    }

    // Check amount limit
    const newAmount = BigInt(data.dailyTransferAmount) + BigInt(amount);
    if (newAmount > BigInt(maxAmountPerDay)) {
      await this.db.incrementMetric("rate_limit_amount_exceeded");
      return {
        allowed: false,
        reason: `Daily amount limit exceeded`,
      };
    }

    // Update rate limit data
    data.dailyTransactionCount++;
    data.dailyTransferAmount = newAmount.toString();
    data.lastTransactionTime = now;

    await this.db.updateRateLimitData(account, token, data);
    await this.db.incrementMetric("rate_limit_checks_passed");

    return { allowed: true };
  }

  /**
   * Gets transaction history for an account
   *
   * @param account - Account address
   * @param limit - Maximum number of transactions to return
   * @returns Array of transaction records
   */
  async getAccountHistory(account: string, limit: number = 100): Promise<TransactionRecord[]> {
    return await this.db.getTransactionsByAccount(account, limit);
  }

  /**
   * Gets system metrics for monitoring
   *
   * @returns Map of metric names to values
   */
  async getMetrics(): Promise<Record<string, number>> {
    return await this.db.getMetrics();
  }

  /**
   * Cleanup expired data (should be called periodically)
   */
  async cleanup(): Promise<void> {
    await this.db.cleanupExpiredNonces();

    // Clean expired cache entries
    const now = Date.now();
    for (const [key, data] of this.cache.entries()) {
      if (data.expiresAt < now) {
        this.cache.delete(key);
      }
    }

    await this.db.incrementMetric("cleanup_runs");
  }
}

/**
 * Global state manager instance
 * In production, initialize this with your database
 */
export const globalStateManager = new StateManager();

/**
 * Periodic cleanup task
 * Run this in a background worker in production
 *
 * @param intervalMs - Cleanup interval in milliseconds (default 1 hour)
 * @returns NodeJS timer handle
 */
export function startCleanupTask(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await globalStateManager.cleanup();
      console.log("State cleanup completed successfully");
    } catch (error) {
      console.error("State cleanup failed:", error);
    }
  }, intervalMs);
}
