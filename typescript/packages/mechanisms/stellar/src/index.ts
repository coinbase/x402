/**
 * @module @x402/stellar - x402 Payment Protocol Stellar Implementation
 *
 * This module provides the Stellar-specific implementation of the x402 payment protocol.
 */

// Export exact implementation
export { ExactStellarScheme } from "./exact";

// Export signer utilities and types
export { createEd25519Signer } from "./signer";
export type { ClientStellarSigner, FacilitatorStellarSigner, Ed25519Signer } from "./signer";

// Export payload types
export type { ExactStellarPayloadV2 } from "./types";

// Export constants
export * from "./constants";

// Export utils
export * from "./utils";
