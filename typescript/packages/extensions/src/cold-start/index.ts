/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
/**
 * Cold-start signal helpers for x402 discovery and registration metadata.
 *
 * These utilities intentionally stay provider-agnostic and stop at:
 * - typed signal/category definitions
 * - parsing and extraction
 * - freshness checks
 * - detached signature verification with caller-supplied JWK resolution
 *
 * They do not define trust policy and they do not modify the ERC-8004
 * reputation flow.
 *
 * @example
 * ```typescript
 * import {
 *   extractColdStartSignals,
 *   getFreshColdStartSignals,
 *   verifyColdStartSignalSignature,
 * } from "@x402/extensions/cold-start";
 *
 * const signals = extractColdStartSignals(discoveredResource);
 *
 * if (!signals) {
 *   return;
 * }
 *
 * for (const { signal } of getFreshColdStartSignals(signals)) {
 *   if (!signal.sig) {
 *     continue;
 *   }
 *
 *   const verification = await verifyColdStartSignalSignature(signal, {
 *     resolveJwk: ({ kid }) => trustedKeyStore.lookup(kid),
 *   });
 *
 *   if (verification.valid) {
 *     // Treat as one usable pre-payment signal in local policy.
 *   }
 * }
 * ```
 */

export {
  ColdStartSignalSchema,
  ColdStartSignalsSchema,
  parseColdStartSignals,
  safeParseColdStartSignals,
  extractColdStartSignals,
  isColdStartSignal,
  isColdStartSignals,
  isSignedColdStartSignal,
  listColdStartSignals,
  isColdStartSignalFresh,
  getFreshColdStartSignals,
} from './parse'

export { canonicalizeColdStartSignal, verifyColdStartSignalSignature } from './verify'

export {
  COLD_START_SIGNAL_CATEGORIES,
  type ColdStartSignalCategory,
  type ColdStartSignalSignatureFields,
  type ColdStartSignal,
  type OnChainCredentialSignal,
  type OnChainActivitySignal,
  type OffChainAttestationSignal,
  type DiscoveryAttestationSignal,
  type ColdStartSignals,
  type ColdStartSignalEnvelope,
  type CategorizedColdStartSignal,
  type SignedColdStartSignal,
  type SupportedColdStartSignalAlgorithm,
  type ResolveColdStartSignalJwkOptions,
  type ColdStartSignalJwkResolver,
  type VerifyColdStartSignalOptions,
  type VerifyColdStartSignalResult,
} from './types'
