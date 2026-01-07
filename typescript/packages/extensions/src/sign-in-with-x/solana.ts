/**
 * Solana Sign-In-With-X (SIWS) support
 *
 * Implements CAIP-122 compliant message format and Ed25519 signature verification
 * for Solana wallets.
 */

import nacl from "tweetnacl";
import type { SIWxExtensionInfo } from "./types";

/**
 * Known Solana network genesis hashes mapped to human-readable names.
 * Used for Chain ID display in SIWS messages.
 */
const SOLANA_NETWORKS: Record<string, string> = {
  "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "mainnet",
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1: "devnet",
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z": "testnet",
};

/**
 * Extract network name from CAIP-2 Solana chainId.
 *
 * @param chainId - CAIP-2 format chain ID (e.g., "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp")
 * @returns Human-readable network name or the reference if unknown
 *
 * @example
 * ```typescript
 * extractSolanaNetwork("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") // "mainnet"
 * extractSolanaNetwork("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") // "devnet"
 * extractSolanaNetwork("solana:custom123") // "custom123"
 * ```
 */
export function extractSolanaNetwork(chainId: string): string {
  const [, reference] = chainId.split(":");
  return SOLANA_NETWORKS[reference] ?? reference;
}

/**
 * Format SIWS message following CAIP-122 ABNF specification.
 *
 * The message format is identical to SIWE (EIP-4361) but uses "Solana account"
 * instead of "Ethereum account" in the header line.
 *
 * @param info - Server-provided extension info
 * @param address - Client's Solana wallet address (Base58 encoded public key)
 * @returns Message string ready for signing
 *
 * @example
 * ```typescript
 * const message = formatSIWSMessage(serverInfo, "BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW");
 * // Returns:
 * // "api.example.com wants you to sign in with your Solana account:
 * // BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW
 * //
 * // Sign in to access your content
 * //
 * // URI: https://api.example.com/data
 * // Version: 1
 * // Chain ID: mainnet
 * // Nonce: abc123
 * // Issued At: 2024-01-01T00:00:00.000Z"
 * ```
 */
export function formatSIWSMessage(info: SIWxExtensionInfo, address: string): string {
  const lines: string[] = [
    `${info.domain} wants you to sign in with your Solana account:`,
    address,
    "",
  ];

  // Statement (optional, with blank line after)
  if (info.statement) {
    lines.push(info.statement, "");
  }

  // Required fields
  lines.push(
    `URI: ${info.uri}`,
    `Version: ${info.version}`,
    `Chain ID: ${extractSolanaNetwork(info.chainId)}`,
    `Nonce: ${info.nonce}`,
    `Issued At: ${info.issuedAt}`,
  );

  // Optional fields
  if (info.expirationTime) {
    lines.push(`Expiration Time: ${info.expirationTime}`);
  }
  if (info.notBefore) {
    lines.push(`Not Before: ${info.notBefore}`);
  }
  if (info.requestId) {
    lines.push(`Request ID: ${info.requestId}`);
  }

  // Resources (optional)
  if (info.resources && info.resources.length > 0) {
    lines.push("Resources:");
    for (const resource of info.resources) {
      lines.push(`- ${resource}`);
    }
  }

  return lines.join("\n");
}

/**
 * Verify Ed25519 signature for SIWS.
 *
 * @param message - The SIWS message that was signed
 * @param signature - Ed25519 signature bytes
 * @param publicKey - Solana public key bytes (32 bytes)
 * @returns true if signature is valid
 *
 * @example
 * ```typescript
 * const messageBytes = new TextEncoder().encode(message);
 * const valid = verifySolanaSignature(message, signatureBytes, publicKeyBytes);
 * ```
 */
export function verifySolanaSignature(
  message: string,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(messageBytes, signature, publicKey);
}

/**
 * Decode Base58 string to bytes.
 *
 * Solana uses Base58 encoding (Bitcoin alphabet) for addresses and signatures.
 * This is a minimal implementation to avoid adding bs58 as a dependency.
 *
 * @param encoded - Base58 encoded string
 * @returns Decoded bytes
 * @throws Error if string contains invalid Base58 characters
 *
 * @example
 * ```typescript
 * const publicKeyBytes = decodeBase58("BSmWDgE9ex6dZYbiTsJGcwMEgFp8q4aWh92hdErQPeVW");
 * // Returns Uint8Array of 32 bytes
 * ```
 */
export function decodeBase58(encoded: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  // Count leading zeros (Base58 '1' = 0x00 byte)
  let leadingZeros = 0;
  for (const char of encoded) {
    if (char === "1") {
      leadingZeros++;
    } else {
      break;
    }
  }

  // Decode the rest
  const bytes: number[] = [];
  for (const char of encoded) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) {
      throw new Error(`Invalid Base58 character: ${char}`);
    }

    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Reverse and prepend leading zeros
  bytes.reverse();
  const result = new Uint8Array(leadingZeros + bytes.length);
  result.set(bytes, leadingZeros);

  return result;
}

/**
 * Encode bytes to Base58 string.
 *
 * @param bytes - Bytes to encode
 * @returns Base58 encoded string
 */
export function encodeBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  // Count leading zeros
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      leadingZeros++;
    } else {
      break;
    }
  }

  // Encode the rest
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  // Convert to string with leading '1's for zeros
  let result = "1".repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }

  return result;
}
