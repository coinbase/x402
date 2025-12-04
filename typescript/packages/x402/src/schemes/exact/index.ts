import type { Network } from "../../types/shared";

// Re-export concrete implementations so existing imports keep working
export * as evm from "./evm";
export * as svm from "./svm";
export * as btcLightning from "./btc_lightning";

/**
 * Scheme identifier for “exact” payments.
 *
 * This is the canonical string used in `PaymentRequirements.scheme`
 * and `PaymentPayload.scheme` when using the exact payment scheme.
 */
export const SCHEME = "exact" as const;

export type ExactNetworkKind = "evm" | "svm" | "btc_lightning";

/**
 * Returns which concrete implementation (EVM, SVM, or BTC Lightning)
 * should be used for a given `network` when the scheme is `exact`.
 *
 * This is used by higher-level routers (e.g. facilitator/client)
 * to decide which scheme module to delegate to.
 *
 * @param network - The x402 network identifier, e.g. `"base"`,
 *   `"solana-devnet"`, `"btc-lightning-signet"`.
 *
 * @returns
 *   - `"evm"` for EVM-compatible networks
 *   - `"svm"` for Solana/SVM networks
 *   - `"btc_lightning"` for Lightning networks
 *   - `undefined` if the network is not supported by the `exact` scheme
 */
export function getExactNetworkKind(network: Network): ExactNetworkKind | undefined {
  switch (network) {
    // === EVM networks ===
    case "abstract":
    case "abstract-testnet":
    case "base":
    case "base-sepolia":
    case "avalanche":
    case "avalanche-fuji":
    case "iotex":
    case "sei":
    case "sei-testnet":
    case "polygon":
    case "polygon-amoy":
    case "peaq":
    case "story":
    case "educhain":
    case "skale-base-sepolia":
      return "evm";

    // === Solana / SVM networks ===
    case "solana":
    case "solana-devnet":
      return "svm";

    // === BTC Lightning networks ===
    case "btc-lightning-signet":
    case "btc-lightning-mainnet":
      return "btc_lightning";

    default:
      return undefined;
  }
}
