/**
 * Type definitions for cold-start trust signals.
 *
 * These helpers are intended for discovery and registration metadata, not for
 * modifying the core x402 payment flow.
 */

/**
 * Known cold-start signal categories from the draft specification.
 */
export const COLD_START_SIGNAL_CATEGORIES = [
  "onChainCredentials",
  "onChainActivity",
  "offChainAttestations",
  "discoveryAttestations",
] as const;

export type ColdStartSignalCategory = (typeof COLD_START_SIGNAL_CATEGORIES)[number];

/**
 * Signature metadata that may accompany a cold-start signal.
 */
export interface ColdStartSignalSignatureFields {
  /**
   * Detached signature over the canonical signal payload.
   */
  sig?: string;
  /**
   * Key identifier for the signing key.
   */
  kid?: string;
  /**
   * Optional JWKS endpoint hint for the signing key.
   */
  jwks?: string;
  /**
   * Signature algorithm hint. The verifier also accepts `jwk.alg`.
   */
  alg?: string;
}

/**
 * Generic cold-start signal shape.
 *
 * Signal-specific fields are intentionally left open so providers can add
 * category-specific payloads without waiting on SDK updates.
 */
export interface ColdStartSignal extends Record<string, unknown>, ColdStartSignalSignatureFields {
  /**
   * Provider-defined signal type.
   */
  type: string;
  /**
   * Optional provider identifier.
   */
  provider?: string;
  /**
   * ISO-8601 timestamp for when the signal was checked or issued.
   */
  checkedAt?: string;
  /**
   * Freshness window in seconds.
   */
  ttlSeconds?: number;
}

export type OnChainCredentialSignal = ColdStartSignal;

export type OnChainActivitySignal = ColdStartSignal;

export type OffChainAttestationSignal = ColdStartSignal;

export type DiscoveryAttestationSignal = ColdStartSignal;

/**
 * Typed container for known cold-start signal categories.
 */
export interface ColdStartSignals {
  onChainCredentials?: OnChainCredentialSignal[];
  onChainActivity?: OnChainActivitySignal[];
  offChainAttestations?: OffChainAttestationSignal[];
  discoveryAttestations?: DiscoveryAttestationSignal[];
}

/**
 * Common envelope shape used by discovery metadata or registration payloads.
 */
export interface ColdStartSignalEnvelope {
  coldStartSignals?: ColdStartSignals;
}

/**
 * Flattened signal paired with its category for client-side iteration.
 */
export interface CategorizedColdStartSignal<T extends ColdStartSignal = ColdStartSignal> {
  category: ColdStartSignalCategory;
  signal: T;
}

/**
 * Signal with enough metadata to attempt detached signature verification.
 */
export interface SignedColdStartSignal extends ColdStartSignal {
  sig: string;
  kid: string;
}

/**
 * Algorithm identifiers currently supported by the reference verifier.
 *
 * The broader draft is intentionally algorithm-agnostic. This union only
 * reflects the helper's currently implemented WebCrypto paths.
 */
export type SupportedColdStartSignalAlgorithm = "RS256" | "ES256" | "EdDSA" | "Ed25519";

export interface ResolveColdStartSignalJwkOptions {
  signal: SignedColdStartSignal;
  kid: string;
  jwks?: string;
}

export type ColdStartSignalJwkResolver = (
  options: ResolveColdStartSignalJwkOptions,
) => Promise<JsonWebKey | null | undefined> | JsonWebKey | null | undefined;

export interface VerifyColdStartSignalOptions {
  /**
   * Override the signature algorithm instead of reading `signal.alg` or `jwk.alg`.
   */
  algorithm?: string;
  /**
   * Provide a JWK directly when key resolution is already handled by the caller.
   */
  jwk?: JsonWebKey;
  /**
   * Resolve a JWK for the signal without embedding network access in this helper.
   */
  resolveJwk?: ColdStartSignalJwkResolver;
  /**
   * Override the payload that should be verified.
   *
   * If omitted, `canonicalizeColdStartSignal(signal)` is used.
   */
  payload?: string | Uint8Array;
  /**
   * Provide custom canonicalization when the provider signs a non-default payload.
   */
  canonicalize?: (signal: ColdStartSignal) => string | Uint8Array;
}

export interface VerifyColdStartSignalResult {
  valid: boolean;
  error?: string;
  algorithm?: string;
  keyId?: string;
}
