import { toHex } from "viem";
import { EVM_NETWORK_CHAIN_ID_MAP, EvmNetworkV1 } from "./v1";

/**
 * Extract chain ID from a network identifier string.
 *
 * Supports two formats:
 * - CAIP-2: "eip155:8453" -> 8453
 * - Legacy v1 name: "base-sepolia" -> 84532
 *
 * @param network - The network identifier (CAIP-2 or legacy name)
 * @returns The numeric chain ID
 * @throws Error if the network format is invalid or the name is unsupported
 */
export function getEvmChainId(network: string): number {
  if (network.startsWith("eip155:")) {
    const idStr = network.split(":")[1];
    const chainId = parseInt(idStr, 10);
    if (isNaN(chainId)) {
      throw new Error(`Invalid CAIP-2 chain ID: ${network}`);
    }
    return chainId;
  }

  const chainId = EVM_NETWORK_CHAIN_ID_MAP[network as EvmNetworkV1];
  if (!chainId) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return chainId;
}

/**
 * Get the crypto object from the global scope.
 *
 * @returns The crypto object
 * @throws Error if crypto API is not available
 */
function getCrypto(): Crypto {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (!cryptoObj) {
    throw new Error("Crypto API not available");
  }
  return cryptoObj;
}

/**
 * Create a random 32-byte nonce for EIP-3009 authorization.
 *
 * @returns A hex-encoded 32-byte nonce
 */
export function createNonce(): `0x${string}` {
  return toHex(getCrypto().getRandomValues(new Uint8Array(32)));
}

/**
 * Creates a random 256-bit nonce for Permit2.
 * Permit2 uses uint256 nonces (not bytes32 like EIP-3009).
 *
 * @returns A string representation of the random nonce
 */
export function createPermit2Nonce(): string {
  const randomBytes = getCrypto().getRandomValues(new Uint8Array(32));
  return BigInt(toHex(randomBytes)).toString();
}
