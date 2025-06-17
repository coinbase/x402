import { z } from "zod";

export enum NetworkEnum {
  BASE_SEPOLIA = "base-sepolia",
  BASE = "base",
  AVALANCHE_FUJI = "avalanche-fuji",
  AVALANCHE = "avalanche",
  IOTEX = "iotex",
  SOLANA_MAINNET = "solana-mainnet",
  SOLANA_DEVNET = "solana-devnet",
}

export const NetworkSchema = z.nativeEnum(NetworkEnum);
export type Network = z.infer<typeof NetworkSchema>;

export const SupportedEVMNetworks: Network[] = [
  NetworkEnum.BASE_SEPOLIA,
  NetworkEnum.BASE,
  NetworkEnum.AVALANCHE_FUJI,
  NetworkEnum.AVALANCHE,
  NetworkEnum.IOTEX,
];
export const EvmNetworkToChainId = new Map<Network, number>([
  [NetworkEnum.BASE_SEPOLIA, 84532],
  [NetworkEnum.BASE, 8453],
  [NetworkEnum.AVALANCHE_FUJI, 43113],
  [NetworkEnum.AVALANCHE, 43114],
  [NetworkEnum.IOTEX, 4689],
]);

export const SupportedSVMNetworks: Network[] = [
  NetworkEnum.SOLANA_MAINNET,
  NetworkEnum.SOLANA_DEVNET,
];

export const ChainIdToNetwork = Object.fromEntries(
  SupportedEVMNetworks.map(network => [EvmNetworkToChainId.get(network), network]),
) as Record<number, Network>;
