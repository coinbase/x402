/**
 * Constants for Kaspa x402 integration.
 */

/** 1 KAS = 100,000,000 sompi */
export const SOMPI_PER_KAS = 100_000_000n;

/** Minimum transaction fee in sompi */
export const MIN_FEE_SOMPI = 10_000n;

/** Default confirmation timeout (30 seconds — generous for 10 BPS) */
export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 30_000;

/** CAIP-2 family pattern for Kaspa networks */
export const KASPA_CAIP_FAMILY = "kaspa:*";

/** Known Kaspa network identifiers (CAIP-2) */
export const KASPA_NETWORKS = {
  mainnet: "kaspa:mainnet",
  testnet: "kaspa:testnet",
  devnet: "kaspa:devnet",
  simnet: "kaspa:simnet",
} as const;

/**
 * Native KAS asset identifier.
 * Kaspa's native currency — no contract address needed.
 * We use "native" as the asset identifier (similar to how ETH is handled).
 */
export const KAS_NATIVE_ASSET = "native";

/** Valid covenant token ID: 64 lowercase hex characters (32 bytes) */
export const COVENANT_ID_REGEX = /^[0-9a-f]{64}$/;

/**
 * Check whether an asset identifier refers to a covenant token.
 * Returns false for "native" (KAS) and true for valid 64-char hex covenant IDs.
 *
 * @param asset - The asset identifier to check
 * @returns True if the asset is a valid covenant token ID
 */
export function isCovenantAsset(asset: string): boolean {
  return COVENANT_ID_REGEX.test(asset);
}

/**
 * Validate that an asset identifier is either "native" or a valid covenant ID.
 * Throws on invalid values (e.g., "USDC", short hex, uppercase hex).
 *
 * @param asset - The asset identifier to validate
 */
export function validateAsset(asset: string): void {
  if (asset !== KAS_NATIVE_ASSET && !COVENANT_ID_REGEX.test(asset)) {
    throw new Error(
      `Invalid asset: "${asset}". Must be "${KAS_NATIVE_ASSET}" or a 64-character lowercase hex covenant ID.`,
    );
  }
}
