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
  "skale-nebula",
  "skale-europa",
  "skale-calypso",
  "skale-nebula-testnet",
  "skale-europa-testnet",
  "skale-calypso-testnet",
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
  "skale-nebula",
  "skale-europa",
  "skale-calypso",
  "skale-nebula-testnet",
  "skale-europa-testnet",
  "skale-calypso-testnet",
];
export const EvmNetworkToChainId = new Map<Network, number>([
  ["base-sepolia", 84532],
  ["base", 8453],
  ["avalanche-fuji", 43113],
  ["avalanche", 43114],
  ["iotex", 4689],
  ["sei", 1329],
  ["sei-testnet", 1328],
  ["skale-nebula", 1482601649],
  ["skale-europa", 2046399126],
  ["skale-calypso", 1564830818],
  ["skale-nebula-testnet", 37084624],
  ["skale-europa-testnet", 1444673419],
  ["skale-calypso-testnet", 974399131],
]);

// svm
export const SupportedSVMNetworks: Network[] = ["solana-devnet", "solana"];
export const SvmNetworkToChainId = new Map<Network, number>([
  ["solana-devnet", 103],
  ["solana", 101],
]);

export const ChainIdToNetwork = Object.fromEntries(
  [...SupportedEVMNetworks, ...SupportedSVMNetworks].map(network => [
    EvmNetworkToChainId.get(network),
    network,
  ]),
) as Record<number, Network>;
