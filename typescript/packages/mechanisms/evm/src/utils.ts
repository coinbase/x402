import { toHex } from "viem";
import { EVM_NETWORK_CHAIN_ID_MAP, EvmNetworkV1 } from "./v1";

/**
 * Extract chain ID from network string (e.g., "base-sepolia" -> 84532)
 * Used by v1 implementations
 *
 * @param network - The network identifier
 * @returns The numeric chain ID
 * @throws Error if the network is not supported
 */
export function getEvmChainId(network: EvmNetworkV1): number {
  const chainId = EVM_NETWORK_CHAIN_ID_MAP[network];
  if (!chainId) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return chainId;
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
