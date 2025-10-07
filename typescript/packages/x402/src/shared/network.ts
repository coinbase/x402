import {
  EvmNetworkToChainId,
  Network,
  SvmNetworkToChainId,
  StarknetNetworkToChainId,
} from "../types/shared";

/**
 * Converts a network name to its corresponding chain ID
 *
 * @param network - The network name to convert to a chain ID
 * @returns The chain ID for the specified network (number for EVM/SVM, string for Starknet)
 * @throws Error if the network is not supported
 */
export function getNetworkId(network: Network): number | string {
  if (EvmNetworkToChainId.has(network)) {
    return EvmNetworkToChainId.get(network)!;
  }
  if (SvmNetworkToChainId.has(network)) {
    return SvmNetworkToChainId.get(network)!;
  }
  if (StarknetNetworkToChainId.has(network)) {
    return StarknetNetworkToChainId.get(network)!;
  }
  throw new Error(`Unsupported network: ${network}`);
}

/**
 * Converts a network name to its corresponding numeric chain ID (EVM/SVM only)
 *
 * @param network - The network name to convert to a chain ID
 * @returns The numeric chain ID for the specified network
 * @throws Error if the network is not supported or is not EVM/SVM
 */
export function getNumericNetworkId(network: Network): number {
  if (EvmNetworkToChainId.has(network)) {
    return EvmNetworkToChainId.get(network)!;
  }
  if (SvmNetworkToChainId.has(network)) {
    return SvmNetworkToChainId.get(network)!;
  }
  throw new Error(`Network ${network} does not have a numeric chain ID`);
}

