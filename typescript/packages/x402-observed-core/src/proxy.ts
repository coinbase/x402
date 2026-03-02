/**
 * Proxy wrapper for HTTPFacilitatorClient to intercept verify() and settle() calls.
 *
 * This module will be implemented in Task 2.8.
 */

import type { EventStorage } from "./storage";

/**
 * Configuration for the FacilitatorProxy.
 */
export interface ProxyConfig {
  workflowId: string;
  storage: EventStorage;
}

/**
 * FacilitatorProxy class for intercepting facilitator operations.
 */
export class FacilitatorProxy {
  /**
   * Creates a new FacilitatorProxy instance.
   *
   * @param originalClient - The original HTTPFacilitatorClient
   * @param config - Proxy configuration
   */
  constructor(originalClient: unknown, config: ProxyConfig) {
    // Implementation in Task 2.8
  }

  /**
   * Get the proxied facilitator client.
   *
   * @returns Proxied facilitator client
   */
  getProxy(): unknown {
    // Implementation in Task 2.8
    return null;
  }
}
