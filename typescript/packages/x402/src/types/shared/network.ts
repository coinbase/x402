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
  "polygon",
  "polygon-amoy",
  "peaq",
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
  "polygon",
  "polygon-amoy",
  "peaq",
];
export const EvmNetworkToChainId = new Map<Network, number>([
  ["base-sepolia", 84532],
  ["base", 8453],
  ["avalanche-fuji", 43113],
  ["avalanche", 43114],
  ["iotex", 4689],
  ["sei", 1329],
  ["sei-testnet", 1328],
  ["polygon", 137],
  ["polygon-amoy", 80002],
  ["peaq", 3338],
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


export type NetworkFamily = "evm" | "svm" | "hedera";

export function getNetworkFamily(network: Network): NetworkFamily {
  if (SupportedEVMNetworks.includes(network)) return "evm";
  if (SupportedSVMNetworks.includes(network)) return "svm";
  if (SupportedHederaNetworks.includes(network)) return "hedera";
  throw new Error(`Unsupported network: ${network}`);
}

// Build a unified reverse lookup from chainId to network across all supported families
const chainIdNetworkPairs = [
  ...Array.from(EvmNetworkToChainId.entries()),
  ...Array.from(SvmNetworkToChainId.entries()),
  ...Array.from(HederaNetworkToChainId.entries()),
] as Array<[Network, number]>;

const chainIdEntries = chainIdNetworkPairs.map(([network, chainId]) => [String(chainId), network] as const);

export const ChainIdToNetwork = Object.fromEntries(chainIdEntries) as unknown as Record<number, Network>;
