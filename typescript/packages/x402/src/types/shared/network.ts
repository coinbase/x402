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
  "hedera-testnet",
  "hedera-mainnet",
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

// hedera
export const SupportedHederaNetworks: Network[] = ["hedera-testnet", "hedera-mainnet"];
export const HederaNetworkToChainId = new Map<Network, number>([
  ["hedera-testnet", 296],
  ["hedera-mainnet", 295],
]);

export const ChainIdToNetwork = Object.fromEntries(
  [...SupportedEVMNetworks, ...SupportedSVMNetworks, ...SupportedHederaNetworks].map(network => [
    EvmNetworkToChainId.get(network) || SvmNetworkToChainId.get(network) || HederaNetworkToChainId.get(network),
    network,
  ]),
) as Record<number, Network>;
