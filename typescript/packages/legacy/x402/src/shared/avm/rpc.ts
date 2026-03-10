import { AlgodClient } from "@algorandfoundation/algokit-utils/algod-client";
import { SupportedAVMNetworks, type Network } from "../../types/shared/network";

/**
 * Default Algod endpoints
 */
export const DEFAULT_ALGOD_MAINNET = "https://mainnet-api.algonode.cloud";
export const DEFAULT_ALGOD_TESTNET = "https://testnet-api.algonode.cloud";

/**
 * Network to Algod endpoint mapping
 */
export const NetworkToAlgodUrl: Record<string, string> = {
  "algorand-mainnet": DEFAULT_ALGOD_MAINNET,
  "algorand-testnet": DEFAULT_ALGOD_TESTNET,
};

/**
 * Creates an Algod client for the specified network
 *
 * @param network - The Algorand network to connect to
 * @param customUrl - Optional custom Algod endpoint URL
 * @returns An AlgodClient instance
 */
export function createAlgodClient(network: Network, customUrl?: string): AlgodClient {
  if (!SupportedAVMNetworks.includes(network)) {
    throw new Error(`Unsupported AVM network: ${network}`);
  }

  const url = customUrl ?? NetworkToAlgodUrl[network] ?? DEFAULT_ALGOD_TESTNET;
  return new AlgodClient({ baseUrl: url });
}

/**
 * USDC ASA IDs for Algorand networks
 */
export const USDC_ASA_IDS: Record<string, string> = {
  "algorand-mainnet": "31566704",
  "algorand-testnet": "10458941",
};

/**
 * Gets the USDC ASA ID for the network
 *
 * @param network - The Algorand network
 * @returns The USDC ASA ID string for the network
 */
export function getUsdcAsaId(network: Network): string {
  return USDC_ASA_IDS[network] ?? USDC_ASA_IDS["algorand-testnet"];
}
