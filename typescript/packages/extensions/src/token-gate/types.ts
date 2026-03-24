/**
 * Type definitions for the token-gate extension
 *
 * Enables ERC-20, ERC-721, and SPL token holders to access x402-protected resources
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
 * EVM (ERC-20 or ERC-721) contract to check for ownership.
 */
export interface EvmTokenContract {
  vm: "evm";
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
 * Solana SPL token contract to check for ownership.
 */
export interface SvmTokenContract {
  vm: "svm";
  /** base58 SPL token mint address */
  mint: string;
  /** e.g. "solana:mainnet-beta", "solana:devnet" */
  network: string;
  /** Minimum token balance required (default: 1n) */
  minBalance?: bigint;
}

/**
 * A single ERC-20, ERC-721, or SPL token contract to check for ownership.
 */
export type TokenContract = EvmTokenContract | SvmTokenContract;

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
 * Base64-encoded JSON. EVM proofs use EIP-191 personal_sign; Solana proofs use ed25519.
 */
export interface TokenGateProof {
  /** Wallet address — checksummed hex for EVM, base58 for Solana */
  address: string;
  /** Domain of the server (e.g. "api.example.com") */
  domain: string;
  /** ISO 8601 timestamp when the proof was created */
  issuedAt: string;
  /** Signature — hex for EIP-191, base58 for ed25519 */
  signature: string;
  /** Signature scheme used */
  signatureType: "eip191" | "ed25519";
}

/**
 * Zod schema for TokenGateProof validation
 */
export const TokenGateProofSchema = z.object({
  address: z.string(),
  domain: z.string(),
  issuedAt: z.string(),
  signature: z.string(),
  signatureType: z.enum(["eip191", "ed25519"]),
});

/**
 * Serializable EVM contract info included in 402 extension responses.
 */
export interface EvmContractInfo {
  vm: "evm";
  address: string;
  chainId: number;
  type: "ERC-20" | "ERC-721";
}

/**
 * Serializable SVM contract info included in 402 extension responses.
 */
export interface SvmContractInfo {
  vm: "svm";
  mint: string;
  network: string;
}

/**
 * Serializable contract info included in 402 extension responses.
 */
export type TokenGateContractInfo = EvmContractInfo | SvmContractInfo;

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

// ---------------------------------------------------------------------------
// Signer types — defined here so sign.ts, hooks.ts, and index.ts all import
// from one place without cross-module cycles.
// ---------------------------------------------------------------------------

/**
 * Minimal EVM signer interface — compatible with viem WalletClient and PrivateKeyAccount.
 */
export interface TokenGateEvmSigner {
  /** EVM wallet address */
  address: `0x${string}`;
  /** Sign a plain message with EIP-191 personal_sign */
  signMessage: (args: { message: string }) => Promise<`0x${string}`>;
}

/**
 * Wallet-adapter style Solana signer (Phantom, Solflare, @solana/wallet-adapter).
 */
export interface TokenGateWalletAdapterSigner {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  publicKey: string | { toBase58: () => string };
}

/**
 * Signer interface compatible with the `@solana/kit` KeyPairSigner style.
 */
export interface TokenGateSolanaKitSigner {
  address: string;
  signMessages: (
    messages: Array<{ content: Uint8Array; signatures: Record<string, unknown> }>,
  ) => Promise<Array<Record<string, Uint8Array>>>;
}

export type TokenGateSolanaSigner = TokenGateWalletAdapterSigner | TokenGateSolanaKitSigner;

/**
 * Any signer accepted by createTokenGateProof — EVM or Solana.
 */
export type TokenGateSigner = TokenGateEvmSigner | TokenGateSolanaSigner;
