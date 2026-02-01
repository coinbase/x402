/**
 * @fileoverview Network constants and configurations for x402 protocol
 * @module @x402/core/constants
 */

import { Network } from "../types";

/**
 * Supported EVM network configurations for the x402 protocol.
 * These networks support EIP-3009 token transfers.
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md
 */
export const EVM_NETWORKS = {
    /** Ethereum Mainnet */
    ETHEREUM: "eip155:1" as Network,
    /** Base Mainnet - Primary supported network */
    BASE: "eip155:8453" as Network,
    /** Base Sepolia Testnet */
    BASE_SEPOLIA: "eip155:84532" as Network,
    /** Polygon Mainnet */
    POLYGON: "eip155:137" as Network,
    /** Arbitrum One */
    ARBITRUM: "eip155:42161" as Network,
    /** Optimism Mainnet */
    OPTIMISM: "eip155:10" as Network,
} as const;

/**
 * Supported Solana network configurations.
 * These networks support SPL tokens and Token-2022 (v2 only).
 */
export const SOLANA_NETWORKS = {
    /** Solana Mainnet */
    MAINNET: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as Network,
    /** Solana Devnet */
    DEVNET: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as Network,
} as const;

/**
 * All supported network identifiers.
 */
export const SUPPORTED_NETWORKS = {
    ...EVM_NETWORKS,
    SOLANA: SOLANA_NETWORKS.MAINNET,
    SOLANA_DEVNET: SOLANA_NETWORKS.DEVNET,
} as const;

/**
 * Default payment scheme used in x402.
 */
export const DEFAULT_SCHEME = "exact";

/**
 * HTTP header names used in x402 protocol.
 */
export const X402_HEADERS = {
    /** Header containing payment requirements (base64 encoded) */
    PAYMENT_REQUIRED: "x-payment-required",
    /** Header containing signed payment payload */
    PAYMENT_SIGNATURE: "x-payment-signature",
    /** Header containing settlement response */
    PAYMENT_RESPONSE: "x-payment-response",
} as const;

/**
 * HTTP status codes used in x402 protocol.
 */
export const HTTP_STATUS = {
    /** Payment required - returned when payment is needed */
    PAYMENT_REQUIRED: 402,
    /** Success - returned after successful payment and resource delivery */
    OK: 200,
    /** Bad request - malformed payment payload */
    BAD_REQUEST: 400,
    /** Unauthorized - invalid payment signature */
    UNAUTHORIZED: 401,
    /** Forbidden - payment rejected (e.g., insufficient funds) */
    FORBIDDEN: 403,
} as const;

/**
 * Common USDC token addresses on supported networks.
 */
export const USDC_ADDRESSES: Record<string, string> = {
    "eip155:1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
    "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
    "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
    "eip155:137": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon
    "eip155:42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
    "eip155:10": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
};

/**
 * Type for supported network keys.
 */
export type SupportedNetworkKey = keyof typeof SUPPORTED_NETWORKS;

/**
 * Type for EVM network keys.
 */
export type EVMNetworkKey = keyof typeof EVM_NETWORKS;

/**
 * Type for Solana network keys.
 */
export type SolanaNetworkKey = keyof typeof SOLANA_NETWORKS;
