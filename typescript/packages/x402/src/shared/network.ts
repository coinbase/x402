import { EvmNetworkToChainId, Network } from "../types/shared";

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
  // TODO: Solana
  throw new Error(`Unsupported network: ${network}`);
}
