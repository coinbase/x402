import { x402Facilitator } from "@x402/core/facilitator";
import { Network } from "@x402/core/types";
import { ExactHypercoreScheme } from "./scheme.js";

/**
 * Configuration options for registering Hypercore facilitator schemes.
 */
export interface HypercoreFacilitatorConfig {
  /**
   * Hyperliquid API URL for settlement.
   */
  apiUrl?: string;

  /**
   * Optional networks to register.
   */
  networks?: Network[];

  /**
   * Per-network API URL overrides.
   */
  apiUrls?: Record<string, string>;
}

/**
 * Register Hypercore exact schemes on an x402 facilitator.
 *
 * @param facilitator - x402 facilitator instance.
 * @param config - Hypercore facilitator registration options.
 * @returns The facilitator instance for chaining.
 */
export function registerExactHypercoreScheme(
  facilitator: x402Facilitator,
  config?: HypercoreFacilitatorConfig,
): x402Facilitator {
  const networks =
    config?.networks && config.networks.length > 0
      ? config.networks
      : ["hypercore:mainnet" as Network, "hypercore:testnet" as Network];

  const defaultApiUrls: Record<string, string> = {
    "hypercore:mainnet": "https://api.hyperliquid.xyz",
    "hypercore:testnet": "https://api.hyperliquid-testnet.xyz",
  };

  networks.forEach(network => {
    const apiUrl = config?.apiUrls?.[network] || config?.apiUrl || defaultApiUrls[network];

    if (!apiUrl) {
      throw new Error(`No API URL configured for network ${network}`);
    }

    const scheme = new ExactHypercoreScheme({ apiUrl });
    facilitator.register(network, scheme);
  });

  return facilitator;
}
