/**
 * Storage interface for SIWX payment tracking.
 *
 * Implementations track which addresses have paid for which resources,
 * enabling SIWX authentication to grant access without re-payment.
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
}

/**
 * In-memory implementation of SIWxStorage.
 *
 * Suitable for development and single-instance deployments.
 * For production multi-instance deployments, use a persistent storage implementation.
 */
export class InMemorySIWxStorage implements SIWxStorage {
  private paidAddresses = new Map<string, Set<string>>();

  hasPaid(resource: string, address: string): boolean {
    return this.paidAddresses.get(resource)?.has(address.toLowerCase()) ?? false;
  }

  recordPayment(resource: string, address: string): void {
    if (!this.paidAddresses.has(resource)) {
      this.paidAddresses.set(resource, new Set());
    }
    this.paidAddresses.get(resource)!.add(address.toLowerCase());
  }
}
