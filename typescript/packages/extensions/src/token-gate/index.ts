/**
 * Token-Gate Extension for x402
 *
 * Grants free or discounted access to ERC-20/ERC-721/SPL token holders.
 *
 * @module token-gate
 */

// Constants and types
export {
  TOKEN_GATE,
  DEFAULT_PROOF_MAX_AGE,
  DEFAULT_OWNERSHIP_CACHE_TTL,
  TokenGateProofSchema,
} from "./types";
export type {
  TokenContract,
  EvmTokenContract,
  SvmTokenContract,
  TokenGateConfig,
  TokenGateProof,
  TokenGateContractInfo,
  EvmContractInfo,
  SvmContractInfo,
  TokenGateExtensionInfo,
  TokenGateExtension,
  DeclareTokenGateOptions,
  TokenGateEvmSigner,
  TokenGateWalletAdapterSigner,
  TokenGateSolanaKitSigner,
  TokenGateSolanaSigner,
  TokenGateSigner,
} from "./types";

// Signing
export { createTokenGateProof, buildProofMessage } from "./sign";

// Verification
export type { TokenGateVerifyResult } from "./verify";
export { verifyTokenGateProof } from "./verify";

// Parsing and encoding
export { parseTokenGateHeader } from "./parse";
export { encodeTokenGateHeader } from "./encode";

// Schema
export { buildTokenGateSchema } from "./schema";

// On-chain ownership
export { checkOwnership, clearOwnershipCache } from "./ownership";

// Server
export { declareTokenGateExtension } from "./declare";
export { createTokenGateExtension } from "./server";

// Client
export { createTokenGatePayload } from "./client";

// Hooks
export type {
  TokenGateHookEvent,
  CreateTokenGateRequestHookOptions,
  CreateTokenGateClientHookOptions,
} from "./hooks";
export { createTokenGateRequestHook, createTokenGateClientHook } from "./hooks";
