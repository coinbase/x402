import type { CAIP2Identifier, ChainInfo, NetworkInput } from "./types";
import { SUPPORTED_CHAINS, V1_NAME_INDEX } from "./registry";

/**
 * Parses a CAIP-2 identifier string to extract the chain ID.
 *
 * @param caip2 - The CAIP-2 identifier (e.g. "eip155:84532")
 * @returns The numeric chain ID
 */
export function parseCAIP2(caip2: string): number {
  const match = caip2.match(/^eip155:(\d+)$/);
  if (!match) {
    throw new Error(`Invalid CAIP-2 identifier: ${caip2}. Expected format: eip155:{chainId}`);
  }
  return parseInt(match[1], 10);
}

/**
 * Converts a numeric chain ID to a CAIP-2 identifier string.
 *
 * @param chainId - The numeric chain ID
 * @returns The CAIP-2 identifier string
 */
export function toCAIP2(chainId: number): CAIP2Identifier {
  return `eip155:${chainId}` as CAIP2Identifier;
}

/**
 * Resolves a network input (chain ID, CAIP-2 string, or v1 name) to a numeric chain ID.
 *
 * @param network - The network identifier to resolve
 * @returns The numeric chain ID
 */
export function resolveChainId(network: NetworkInput): number {
  if (typeof network === "number") {
    return network;
  }
  if (network.startsWith("eip155:")) {
    return parseCAIP2(network);
  }
  const chain = V1_NAME_INDEX.get(network);
  if (!chain) {
    throw new Error(
      `Unknown network: ${network}. Expected CAIP-2 (eip155:chainId), a known v1 name, or a numeric chain ID.`,
    );
  }
  return chain.chainId;
}

/**
 * Gets the v1 name for a chain ID, if one exists.
 *
 * @param chainId - The numeric chain ID
 * @returns The v1 name or undefined
 */
export function getV1Name(chainId: number): string | undefined {
  return SUPPORTED_CHAINS[chainId]?.v1Name;
}

/**
 * Gets all v1 names for a chain ID as an array.
 *
 * @param chainId - The numeric chain ID
 * @returns An array of v1 names (empty if none)
 */
export function getV1Names(chainId: number): string[] {
  const name = getV1Name(chainId);
  return name ? [name] : [];
}

/**
 * Checks whether a chain ID is in the supported chains registry.
 *
 * @param chainId - The numeric chain ID to check
 * @returns Whether the chain is supported
 */
export function isSupported(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}

/**
 * Retrieves chain info by numeric chain ID.
 *
 * @param chainId - The numeric chain ID
 * @returns The chain info or undefined if not found
 */
export function getChainById(chainId: number): ChainInfo | undefined {
  return SUPPORTED_CHAINS[chainId];
}

/**
 * Retrieves chain info for a network input, throwing if not found.
 *
 * @param network - The network identifier to look up
 * @returns The chain info
 */
export function getChain(network: NetworkInput): ChainInfo {
  const chainId = resolveChainId(network);
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(`Chain ${chainId} is not in the supported chains registry.`);
  }
  return chain;
}

/**
 * Returns all supported chains from the registry.
 *
 * @returns An array of all supported chain info objects
 */
export function getSupportedChains(): ChainInfo[] {
  return Object.values(SUPPORTED_CHAINS);
}

/**
 * Returns all supported mainnet chains.
 *
 * @returns An array of mainnet chain info objects
 */
export function getMainnets(): ChainInfo[] {
  return Object.values(SUPPORTED_CHAINS).filter(c => !c.testnet);
}

/**
 * Returns all supported testnet chains.
 *
 * @returns An array of testnet chain info objects
 */
export function getTestnets(): ChainInfo[] {
  return Object.values(SUPPORTED_CHAINS).filter(c => c.testnet);
}
