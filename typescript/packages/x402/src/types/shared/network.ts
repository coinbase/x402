import { z } from "zod";

export const NetworkSchema = z.enum([
  "abstract",
  "abstract-testnet",
  "arbitrum",
  "avalanche-fuji",
  "avalanche",
  "b3",
  "base-sepolia",
  "base",
  "bsc",
  "ethereum",
  "iotex",
  "optimism",
  "peaq",
  "polygon",
  "polygon-amoy",
  "sei",
  "sei-testnet",
  "solana-devnet",
  "solana",
]);
export type Network = z.infer<typeof NetworkSchema>;

// evm
export const SupportedEVMNetworks: Network[] = [
  "abstract",
  "abstract-testnet",
  "arbitrum",
  "avalanche-fuji",
  "avalanche",
  "b3",
  "base-sepolia",
  "base",
  "bsc",
  "ethereum",
  "iotex",
  "optimism",
  "peaq",
  "polygon",
  "polygon-amoy",
  "sei",
  "sei-testnet",
];
export const EvmNetworkToChainId = new Map<Network, number>([
  ["abstract", 2741],
  ["abstract-testnet", 11124],
  ["arbitrum", 42161],
  ["avalanche-fuji", 43113],
  ["avalanche", 43114],
  ["b3", 8333],
  ["base-sepolia", 84532],
  ["base", 8453],
  ["bsc", 56],
  ["ethereum", 1],
  ["iotex", 4689],
  ["optimism", 10],
  ["peaq", 3338],
  ["polygon", 137],
  ["polygon-amoy", 80002],
  ["sei", 1329],
  ["sei-testnet", 1328],
]);

// svm
export const SupportedSVMNetworks: Network[] = ["solana-devnet", "solana"];
export const SvmNetworkToChainId = new Map<Network, number>([
  ["solana-devnet", 103],
  ["solana", 101],
]);

export const ChainIdToNetwork = Object.fromEntries(
  [...SupportedEVMNetworks, ...SupportedSVMNetworks].map(network => [
    EvmNetworkToChainId.get(network) || SvmNetworkToChainId.get(network),
    network,
  ]),
) as Record<number, Network>;
