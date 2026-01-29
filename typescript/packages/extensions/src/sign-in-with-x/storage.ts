/**
 * Storage interface for SIWX payment tracking and nonce validation.
 *
 * Implementations track which addresses have paid for which resources,
 * enabling SIWX authentication to grant access without re-payment.
 * Optionally tracks used nonces to prevent replay attacks.
 */
export interface SIWxStorage {
  /**
   * Check if an address has paid for a resource.
   *
   * @param resource - The resource path (e.g., "/weather")
   * @param address - The wallet address to check
   * @returns True if the address has paid for the resource
   */
  hasPaid(resource: string, address: string): boolean | Promise<boolean>;

  /**
   * Record that an address has paid for a resource.
   *
   * @param resource - The resource path
   * @param address - The wallet address that paid
   */
  recordPayment(resource: string, address: string): void | Promise<void>;

  /**
   * Check if a nonce has been used (optional - replay attack prevention).
   *
   * If implemented, enables automatic nonce validation in createSIWxRequestHook.
   *
   * @param nonce - The nonce string to check
   * @returns True if the nonce has been used
   */
  hasUsedNonce?(nonce: string): boolean | Promise<boolean>;

  /**
   * Record that a nonce has been used (optional - replay attack prevention).
   *
   * If implemented, nonces will be tracked with TTL-based cleanup.
   *
   * @param nonce - The nonce string to record
   * @param ttlSeconds - Optional TTL in seconds (default: 600 = 10 minutes)
   */
  recordNonce?(nonce: string, ttlSeconds?: number): void | Promise<void>;
}

/**
 * In-memory implementation of SIWxStorage with nonce tracking.
 *
 * Suitable for development and single-instance deployments.
 * For production multi-instance deployments, use a persistent storage implementation.
 */
export class InMemorySIWxStorage implements SIWxStorage {
  private paidAddresses = new Map<string, Set<string>>();
  private usedNonces = new Map<string, number>(); // Map<nonce, expiryTimestamp>

  /**
   * Check if an address has paid for a resource.
   *
   * @param resource - The resource path
   * @param address - The wallet address to check
   * @returns True if the address has paid
   */
  hasPaid(resource: string, address: string): boolean {
    return this.paidAddresses.get(resource)?.has(address.toLowerCase()) ?? false;
  }

  /**
   * Record that an address has paid for a resource.
   *
   * @param resource - The resource path
   * @param address - The wallet address that paid
   */
  recordPayment(resource: string, address: string): void {
    if (!this.paidAddresses.has(resource)) {
      this.paidAddresses.set(resource, new Set());
    }
    this.paidAddresses.get(resource)!.add(address.toLowerCase());
  }

  /**
   * Check if a nonce has been used.
   *
   * Automatically cleans up expired nonces before checking.
   *
   * @param nonce - The nonce string to check
   * @returns True if the nonce has been used
   */
  hasUsedNonce(nonce: string): boolean {
    this.cleanupExpiredNonces();
    return this.usedNonces.has(nonce);
  }

  /**
   * Record that a nonce has been used.
   *
   * Automatically cleans up expired nonces before recording.
   *
   * @param nonce - The nonce string to record
   * @param ttlSeconds - TTL in seconds (default: 600 = 10 minutes)
   */
  recordNonce(nonce: string, ttlSeconds: number = 600): void {
    this.cleanupExpiredNonces();
    this.usedNonces.set(nonce, Date.now() + ttlSeconds * 1000);
  }

  /**
   * Clean up expired nonces from memory.
   *
   * @private
   */
  private cleanupExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, expiry] of this.usedNonces.entries()) {
      if (expiry < now) {
        this.usedNonces.delete(nonce);
      }
    }
  }
}
