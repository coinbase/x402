import { verboseLog } from '../logger';
import { waitForHealth } from '../health';
import type { FacilitatorConfig } from './generic-facilitator';
import type { NetworkSet } from '../networks/networks';

interface Facilitator {
  start: (config: FacilitatorConfig) => Promise<void>;
  health: () => Promise<{ success: boolean }>;
  getUrl: () => string;
  stop: () => Promise<void>;
}

export interface FacilitatorKeys {
  evmPrivateKey?: string;
  svmPrivateKey?: string;
  aptosPrivateKey?: string;
  stellarPrivateKey?: string;
}

/**
 * Manages the async lifecycle of a facilitator process: start, health-check,
 * ready-gate, and stop.
 */
export class FacilitatorManager {
  private facilitator: Facilitator;
  private port: number;
  private readyPromise: Promise<string | null>;
  private url: string | null = null;

  constructor(facilitator: Facilitator, port: number, networks: NetworkSet, keys?: FacilitatorKeys) {
    this.facilitator = facilitator;
    this.port = port;

    // Start facilitator and health checks asynchronously
    this.readyPromise = this.startAndWaitForHealth(networks, keys);
  }

  private async startAndWaitForHealth(networks: NetworkSet, keys?: FacilitatorKeys): Promise<string | null> {
    verboseLog(`  🏛️ Starting facilitator on port ${this.port}...`);

    await this.facilitator.start({
      port: this.port,
      evmPrivateKey: keys?.evmPrivateKey ?? process.env.FACILITATOR_EVM_PRIVATE_KEY,
      svmPrivateKey: keys?.svmPrivateKey ?? process.env.FACILITATOR_SVM_PRIVATE_KEY,
      aptosPrivateKey: keys?.aptosPrivateKey ?? process.env.FACILITATOR_APTOS_PRIVATE_KEY,
      stellarPrivateKey: keys?.stellarPrivateKey ?? process.env.FACILITATOR_STELLAR_PRIVATE_KEY,
      networks,
    });

    const healthy = await waitForHealth(
      () => this.facilitator.health(),
      { label: 'Facilitator', initialDelayMs: 500 },
    );

    if (healthy) {
      this.url = this.facilitator.getUrl();
      return this.url;
    }
    return null;
  }

  async ready(): Promise<string | null> {
    return this.readyPromise;
  }

  getProxy(): Facilitator {
    return this.facilitator;
  }

  async stop(): Promise<void> {
    if (this.facilitator) {
      await this.facilitator.stop();
    }
  }
}
