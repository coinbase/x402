/**
 * CAIP-2 network identifier for Hedera Mainnet.
 */
export const HEDERA_MAINNET_CAIP2 = "hedera:mainnet";

/**
 * CAIP-2 network identifier for Hedera Testnet.
 */
export const HEDERA_TESTNET_CAIP2 = "hedera:testnet";

/**
 * Asset id used by x402 to represent native HBAR.
 */
export const HBAR_ASSET_ID = "0.0.0";

/**
 * Regex for Hedera account and token IDs.
 * Example: 0.0.1234
 */
export const HEDERA_ENTITY_ID_REGEX = /^\d+\.\d+\.\d+$/;

/**
 * Default replay-cache window in milliseconds.
 */
export const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Supported Hedera CAIP-2 networks for this mechanism.
 */
export const SUPPORTED_HEDERA_NETWORKS = [HEDERA_MAINNET_CAIP2, HEDERA_TESTNET_CAIP2] as const;
