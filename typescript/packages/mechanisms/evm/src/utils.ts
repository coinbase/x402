import { toHex } from "viem";
import { Network } from "@x402/core/types";

/**
 * Extract chain ID from network string (e.g., "base-sepolia" -> 84532)
 * Used by v1 implementations
 *
 * @param network - The network identifier
 * @returns The numeric chain ID
 */
export function getEvmChainId(network: Network): number {
  const networkMap: Record<string, number> = {
    // Base
    base: 8453,
    "base-sepolia": 84532,
    // Ethereum
    ethereum: 1,
    sepolia: 11155111,
    // Avalanche
    avalanche: 43114,
    "avalanche-fuji": 43113,
    // Polygon
    polygon: 137,
    "polygon-amoy": 80002,
    // Sei
    sei: 1329,
    "sei-testnet": 1328,
    // Abstract (ZK Stack)
    abstract: 2741,
    "abstract-testnet": 11124,
    // IoTeX
    iotex: 4689,
    // Peaq
    peaq: 3338,
    // Story
    story: 1514,
    // Educhain
    educhain: 41923,
    // SKALE Base Sepolia
    "skale-base-sepolia": 324705682,
  };
  return networkMap[network] || 1;
}

/**
 * Create a random 32-byte nonce for authorization
 *
 * @returns A hex-encoded 32-byte nonce
 */
export function createNonce(): `0x${string}` {
  // Use dynamic import to avoid require() in ESM context
  const cryptoObj =
    typeof globalThis.crypto !== "undefined"
      ? globalThis.crypto
      : (globalThis as { crypto?: Crypto }).crypto;

  if (!cryptoObj) {
    throw new Error("Crypto API not available");
  }

  return toHex(cryptoObj.getRandomValues(new Uint8Array(32)));
}
