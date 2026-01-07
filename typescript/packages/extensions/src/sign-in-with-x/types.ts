/**
 * Type definitions for the Sign-In-With-X (SIWX) extension
 *
 * Implements CAIP-122 standard for chain-agnostic wallet-based identity assertions.
 * Per x402 v2 spec: typescript/site/CHANGELOG-v2.md lines 237-341
 */

import { z } from "zod";

/**
 * Extension identifier constant
 */
export const SIGN_IN_WITH_X = "sign-in-with-x";

/**
 * Supported signature schemes per CHANGELOG-v2.md line 271
 */
export type SignatureScheme =
  | "eip191" // personal_sign (default for EVM EOAs)
  | "eip712" // typed data signing
  | "eip1271" // smart contract wallet verification
  | "eip6492" // counterfactual smart wallet verification
  | "siws" // Sign-In-With-Solana
  | "sep10"; // Stellar SEP-10

/**
 * Server-declared extension info included in PaymentRequired.extensions
 * Per CHANGELOG-v2.md lines 263-272
 */
export interface SIWxExtensionInfo {
  /** Server's domain (derived from resourceUri host) */
  domain: string;
  /** Full resource URI */
  uri: string;
  /** Human-readable purpose for signing */
  statement?: string;
  /** CAIP-122 version, always "1" */
  version: string;
  /** CAIP-2 chain identifier (e.g., "eip155:8453") */
  chainId: string;
  /** Cryptographic nonce (SDK auto-generates) */
  nonce: string;
  /** ISO 8601 timestamp (SDK auto-generates) */
  issuedAt: string;
  /** Optional expiry (default: +5 min) */
  expirationTime?: string;
  /** Optional validity start */
  notBefore?: string;
  /** Optional correlation ID */
  requestId?: string;
  /** Associated resources */
  resources?: string[];
  /** Signature scheme hint */
  signatureScheme?: SignatureScheme;
}

/**
 * JSON Schema for SIWX extension validation
 * Per CHANGELOG-v2.md lines 276-292
 */
export interface SIWxExtensionSchema {
  $schema: string;
  type: "object";
  properties: {
    domain: { type: "string" };
    address: { type: "string" };
    statement?: { type: "string" };
    uri: { type: "string"; format: "uri" };
    version: { type: "string" };
    chainId: { type: "string" };
    nonce: { type: "string" };
    issuedAt: { type: "string"; format: "date-time" };
    expirationTime?: { type: "string"; format: "date-time" };
    notBefore?: { type: "string"; format: "date-time" };
    requestId?: { type: "string" };
    resources?: { type: "array"; items: { type: "string"; format: "uri" } };
    signature: { type: "string" };
  };
  required: string[];
}

/**
 * Complete SIWX extension structure (info + schema)
 * Follows standard x402 v2 extension pattern
 */
export interface SIWxExtension {
  info: SIWxExtensionInfo;
  schema: SIWxExtensionSchema;
}

/**
 * Zod schema for SIWX payload validation
 * Client proof payload sent in SIGN-IN-WITH-X header
 * Per CHANGELOG-v2.md lines 301-315
 */
export const SIWxPayloadSchema = z.object({
  domain: z.string(),
  address: z.string(),
  statement: z.string().optional(),
  uri: z.string(),
  version: z.string(),
  chainId: z.string(),
  nonce: z.string(),
  issuedAt: z.string(),
  expirationTime: z.string().optional(),
  notBefore: z.string().optional(),
  requestId: z.string().optional(),
  resources: z.array(z.string()).optional(),
  signatureScheme: z
    .enum(["eip191", "eip712", "eip1271", "eip6492", "siws", "sep10"])
    .optional(),
  signature: z.string(),
});

/**
 * Client proof payload type (inferred from zod schema)
 */
export type SIWxPayload = z.infer<typeof SIWxPayloadSchema>;

/**
 * Common Solana network CAIP-2 identifiers.
 * Uses genesis hash as the chain reference per CAIP-30.
 */
export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const SOLANA_TESTNET = "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z";

/**
 * Options for declaring SIWX extension on server
 */
export interface DeclareSIWxOptions {
  /** Full resource URI (domain derived from this) */
  resourceUri: string;
  /** Human-readable purpose */
  statement?: string;
  /** CAIP-122 version (default: "1") */
  version?: string;
  /**
   * CAIP-2 network identifier.
   * - EVM: "eip155:8453" (Base), "eip155:1" (Ethereum mainnet)
   * - Solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" (mainnet)
   *
   * Use SOLANA_MAINNET, SOLANA_DEVNET, or SOLANA_TESTNET constants for Solana.
   */
  network: `eip155:${string}` | `solana:${string}` | (string & {});
  /** Optional explicit expiration time */
  expirationTime?: string;
  /** Signature scheme hint */
  signatureScheme?: SignatureScheme;
}

/**
 * Validation result from validateSIWxMessage
 */
export interface SIWxValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Options for message validation
 */
export interface SIWxValidationOptions {
  /** Maximum age for issuedAt in milliseconds (default: 5 minutes) */
  maxAge?: number;
  /** Custom nonce validation function */
  checkNonce?: (nonce: string) => boolean | Promise<boolean>;
}

/**
 * Result from signature verification
 */
export interface SIWxVerifyResult {
  valid: boolean;
  /** Recovered/verified address (checksummed) */
  address?: string;
  error?: string;
}

/**
 * Options for signature verification
 */
export interface SIWxVerifyOptions {
  /** Web3 provider for EIP-1271/6492 smart wallet verification */
  provider?: unknown;
  /** Enable smart wallet verification */
  checkSmartWallet?: boolean;
}
