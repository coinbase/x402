/**
 * Type definitions for the token-gate extension
 *
 * Enables ERC-20 and ERC-721 token holders to access x402-protected resources
 * for free or at a discount by proving on-chain token ownership.
 */

import { z } from "zod";
import type { Chain } from "viem";

/**
 * Extension identifier constant
 */
export const TOKEN_GATE = "token-gate";

/**
 * Default proof max age in seconds (5 minutes)
 */
export const DEFAULT_PROOF_MAX_AGE = 300;

/**
 * Default ownership cache TTL in seconds (5 minutes)
 */
export const DEFAULT_OWNERSHIP_CACHE_TTL = 300;

/**
 * A single ERC-20 or ERC-721 contract to check for ownership.
 */
export interface TokenContract {
  /** Contract address on-chain */
  address: `0x${string}`;
  /** viem Chain object (e.g. base, mainnet) */
  chain: Chain;
  /** Token standard */
  type: "ERC-20" | "ERC-721";
  /**
   * Minimum balance required (default: 1n).
   * For ERC-721 this is the number of tokens held (not a specific token ID).
   */
  minBalance?: bigint;
  /**
   * Specific ERC-721 token ID to check via ownerOf().
   * When set, uses ownerOf(tokenId) instead of balanceOf().
   */
  tokenId?: bigint;
}

/**
 * Configuration for the token-gate server hook and fetch wrapper.
 */
export interface TokenGateConfig {
  /** Contracts to check for ownership */
  contracts: TokenContract[];
  /**
   * Whether the holder needs to own all contracts or any one (default: "any")
   */
  matchMode?: "any" | "all";
  /**
   * Access granted to token holders.
   * - "free": full access with no payment required
   * - { discount: number }: percentage discount (0–100), still requires payment
   */
  access: "free" | { discount: number };
  /**
   * Maximum age of a proof in seconds (default: 300).
   * Proofs older than this are rejected.
   */
  proofMaxAge?: number;
  /**
   * TTL for the on-chain ownership cache in seconds (default: 300).
   * Avoids repeated RPC calls for the same address.
   */
  ownershipCacheTtl?: number;
}

/**
 * Proof payload sent in the `token-gate` request header.
 * Base64-encoded JSON, signed with EIP-191 personal_sign.
 */
export interface TokenGateProof {
  /** Wallet address of the requester (checksummed) */
  address: `0x${string}`;
  /** Domain of the server (e.g. "api.example.com") */
  domain: string;
  /** ISO 8601 timestamp when the proof was created */
  issuedAt: string;
  /** EIP-191 personal_sign signature */
  signature: `0x${string}`;
}

/**
 * Zod schema for TokenGateProof validation
 */
export const TokenGateProofSchema = z.object({
  address: z.string(),
  domain: z.string(),
  issuedAt: z.string(),
  signature: z.string(),
});

/**
 * Serializable contract info included in 402 extension responses.
 * Uses chainId (number) instead of the full viem Chain object.
 */
export interface TokenGateContractInfo {
  address: string;
  chainId: number;
  type: "ERC-20" | "ERC-721";
}

/**
 * Extension info advertised in 402 PaymentRequired responses.
 */
export interface TokenGateExtensionInfo {
  /** Serializable contract descriptors */
  contracts: TokenGateContractInfo[];
  /** Server domain (used for proof verification) */
  domain: string;
  /** Human-readable message (e.g. "Token holders get free access.") */
  message?: string;
}

/**
 * Complete token-gate extension structure placed in PaymentRequired.extensions.
 */
export interface TokenGateExtension {
  info: TokenGateExtensionInfo;
  schema: object;
}

/**
 * Options for declareTokenGateExtension (per-route declaration).
 */
export interface DeclareTokenGateOptions {
  /** Contracts to advertise to clients */
  contracts: TokenContract[];
  /** Server domain. If omitted, derived from request URL. */
  domain?: string;
  /** Human-readable message */
  message?: string;
}

/**
 * Internal declaration type that carries _options for enrichPaymentRequiredResponse.
 */
export interface TokenGateDeclaration extends TokenGateExtension {
  _options: DeclareTokenGateOptions;
}
