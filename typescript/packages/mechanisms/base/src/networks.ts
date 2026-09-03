import type { FindDefaultAsset } from "@x402/core/types";
import { findDefaultAsset, type ExactDefaultAssetInfo } from "@x402/evm";

/** Base mainnet CAIP-2 network id. */
export const BASE_MAINNET = "eip155:8453" as const;

/** Base Sepolia (testnet) CAIP-2 network id. */
export const BASE_SEPOLIA = "eip155:84532" as const;

/** The only two networks `@x402/base` is scoped to. */
export const BASE_NETWORKS = [BASE_MAINNET, BASE_SEPOLIA] as const;

/** A CAIP-2 network id `@x402/base` is scoped to. */
export type BaseNetwork = (typeof BASE_NETWORKS)[number];

/**
 * Checks whether a network identifier is one `@x402/base` is scoped to
 * (`eip155:8453` mainnet or `eip155:84532` Sepolia).
 *
 * @param network - CAIP-2 network identifier to check.
 * @returns `true` when `network` is Base mainnet or Base Sepolia.
 */
export function isBaseNetwork(network: string): network is BaseNetwork {
  return (BASE_NETWORKS as readonly string[]).includes(network);
}

/**
 * Asserts that a network identifier is one `@x402/base` is scoped to.
 *
 * `@x402/base`'s wrappers are thin pass-throughs to `@x402/evm`, which is
 * generic across the entire `eip155:*` family. Without this guard, a
 * `BaseScheme` registered under a wildcard pattern (or called directly,
 * bypassing `@x402/core` registration) would silently process payments for
 * any EVM chain. This makes that a loud, immediate failure instead.
 *
 * @param network - CAIP-2 network identifier to check.
 * @param operation - Name of the calling operation, included in the error for context.
 * @throws When `network` is not Base mainnet or Base Sepolia.
 */
export function assertBaseNetwork(
  network: string,
  operation: string,
): asserts network is BaseNetwork {
  if (!isBaseNetwork(network)) {
    throw new Error(
      `@x402/base: ${operation} does not support network "${network}" - ` +
        `@x402/base only supports ${BASE_MAINNET} (Base) and ${BASE_SEPOLIA} (Base Sepolia). ` +
        `Use @x402/evm directly for other EVM networks.`,
    );
  }
}

/**
 * Base-scoped reverse lookup for a default asset by address and network.
 *
 * Identical to `@x402/evm`'s `findDefaultAsset`, except it returns
 * `undefined` for any network `@x402/base` is not scoped to, instead of
 * resolving against `@x402/evm`'s full `eip155:*` asset table. Used as the
 * client wrappers' `findDefaultAsset` hook, which `@x402/core` also reads
 * for default spend-control asset recognition.
 *
 * @param asset - Asset address from payment requirements.
 * @param network - CAIP-2 network identifier.
 * @returns Matching entry, or `undefined` when off-Base or unrecognized.
 */
export const findBaseDefaultAsset: FindDefaultAsset<ExactDefaultAssetInfo> = (asset, network) => {
  if (!isBaseNetwork(network)) {
    return undefined;
  }
  return findDefaultAsset(asset, network);
};
