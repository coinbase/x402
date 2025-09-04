import { z } from "zod";

export const NetworkSchema = z.enum([
  "base-sepolia",
  "base",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "solana-devnet",
  "solana",
  "sei",
  "sei-testnet",
  "starknet",
  "starknet-sepolia",
]);
export type Network = z.infer<typeof NetworkSchema>;

// evm
export const SupportedEVMNetworks: Network[] = [
  "base-sepolia",
  "base",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "sei",
  "sei-testnet",
];
export const EvmNetworkToChainId = new Map<Network, number>([
  ["base-sepolia", 84532],
  ["base", 8453],
  ["avalanche-fuji", 43113],
  ["avalanche", 43114],
  ["iotex", 4689],
  ["sei", 1329],
  ["sei-testnet", 1328],
]);

// svm
export const SupportedSVMNetworks: Network[] = ["solana-devnet", "solana"];
export const SvmNetworkToChainId = new Map<Network, number>([
  ["solana-devnet", 103],
  ["solana", 101],
]);

// starknet
export const SupportedStarknetNetworks: Network[] = ["starknet", "starknet-sepolia"];
export const StarknetNetworkToChainId = new Map<Network, string>([
  ["starknet", "0x534e5f4d41494e"], // SN_MAIN
  ["starknet-sepolia", "0x534e5f5345504f4c4941"], // SN_SEPOLIA
]);

export const ChainIdToNetwork = Object.fromEntries(
  [...SupportedEVMNetworks, ...SupportedSVMNetworks].map(network => [
    EvmNetworkToChainId.get(network) || SvmNetworkToChainId.get(network),
    network,
  ]),
) as Record<number, Network>;

export const StarknetChainIdToNetwork = Object.fromEntries(
  SupportedStarknetNetworks.map(network => [StarknetNetworkToChainId.get(network), network]),
) as Record<string, Network>;
