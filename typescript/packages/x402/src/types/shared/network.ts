import { z } from "zod";

export const NetworkSchema = z.enum(["base-sepolia", "base"]);
export type Network = z.infer<typeof NetworkSchema>;

export const SupportedEVMNetworks: Network[] = ["base-sepolia", "base"];
export const EvmNetworkToChainId = new Map<Network, number>([
  ["base-sepolia", 84532],
  ["base", 8453],
]);
