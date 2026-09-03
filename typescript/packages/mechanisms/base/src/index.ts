/**
 * @module @x402/base - x402 Payment Protocol Base Implementation
 *
 * Base-specific (`eip155:8453` / `eip155:84532`) mechanisms for the x402
 * payment protocol. These are thin pass-through wrappers around
 * `@x402/evm` today - they exist as explicit, overridable seams so
 * Base-specific behavior can be introduced later without changing the
 * public `@x402/base` API surface.
 */

// Signers (shared across all schemes) - renamed from `@x402/evm` so nothing
// "Evm"-named leaks through the public `@x402/base` API surface.
export {
  toClientEvmSigner as toBaseClientSigner,
  toFacilitatorEvmSigner as toBaseFacilitatorSigner,
} from "@x402/evm";
export type {
  ClientEvmSigner as BaseClientSigner,
  FacilitatorEvmSigner as BaseFacilitatorSigner,
} from "@x402/evm";

// Base network scope (shared by all schemes)
export {
  BASE_MAINNET,
  BASE_SEPOLIA,
  BASE_NETWORKS,
  isBaseNetwork,
  assertBaseNetwork,
  findBaseDefaultAsset,
} from "./networks";
export type { BaseNetwork } from "./networks";

// Exact scheme client (default export - the primary payment scheme)
export { BaseScheme } from "./exact";

// Upto scheme client
export { BaseScheme as BaseUptoScheme } from "./upto";

// AuthCapture scheme client (client only - see src/auth-capture/README.md)
export { BaseScheme as BaseAuthCaptureScheme } from "./auth-capture";

// Batch-settlement scheme client
export { BaseScheme as BaseBatchSettlementScheme } from "./batch-settlement";
