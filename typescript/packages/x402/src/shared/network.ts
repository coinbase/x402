import {
  EvmNetworkToChainId,
  Network,
  SvmNetworkToChainId,
  ChainIdToNetwork,
} from "../types/shared";

/**
 * Converts a network name to its corresponding chain ID
 *
 * @param network - The network name to convert to a chain ID
 * @returns The chain ID for the specified network
 * @throws Error if the network is not supported
 */
export function getNetworkId(network: Network): number {
  if (EvmNetworkToChainId.has(network)) {
    return EvmNetworkToChainId.get(network)!;
  }
  if (SvmNetworkToChainId.has(network)) {
    return SvmNetworkToChainId.get(network)!;
  }
  throw new Error(`Unsupported network: ${network}`);
}

/**
 * Converts a chain ID to its corresponding network name
 *
 * @param chainId - The chain ID to convert to a network name
 * @returns The network name for the specified chain ID
 * @throws Error if the chain ID is not supported
 */
export function getNetworkName(chainId: number): Network {
  if (ChainIdToNetwork[chainId]) {
    return ChainIdToNetwork[chainId];
  }

  // TODO: Solana
  throw new Error(`Unsupported chain ID: ${chainId}`);
}
