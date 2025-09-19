import { z } from "zod";

export const CloudflareNetwork = "cloudflare" as const;

export const DeferredNetworkSchema = z.enum([CloudflareNetwork]);

export type DeferredNetwork = z.infer<typeof DeferredNetworkSchema>;

export const isDeferredNetwork = (network: Network): network is DeferredNetwork => {
  return DeferredNetworkSchema.safeParse(network).success;
};

export const ExactNetworkSchema = z.enum([
  "base-sepolia",
  "base",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "solana-devnet",
  "solana",
  "sei",
  "sei-testnet",
]);

export type ExactNetwork = z.infer<typeof ExactNetworkSchema>;

export const NetworkSchema = z.union([ExactNetworkSchema, DeferredNetworkSchema]);
export type Network = z.infer<typeof NetworkSchema>;

// evm
export const SupportedEVMNetworks: ExactNetwork[] = [
  "base-sepolia",
  "base",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "sei",
  "sei-testnet",
];

export const EvmNetworkToChainId = new Map<ExactNetwork, number>([
  ["base-sepolia", 84532],
  ["base", 8453],
  ["avalanche-fuji", 43113],
  ["avalanche", 43114],
  ["iotex", 4689],
  ["sei", 1329],
  ["sei-testnet", 1328],
]);

// svm
export const SupportedSVMNetworks: ExactNetwork[] = ["solana-devnet", "solana"];
export const SvmNetworkToChainId = new Map<ExactNetwork, number>([
  ["solana-devnet", 103],
  ["solana", 101],
]);

export const ChainIdToNetwork = Object.fromEntries(
  [...SupportedEVMNetworks, ...SupportedSVMNetworks].map(network => [
    EvmNetworkToChainId.get(network),
    network,
  ]),
) as Record<number, ExactNetwork>;
