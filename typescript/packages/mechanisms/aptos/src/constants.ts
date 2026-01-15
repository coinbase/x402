import { Network, NetworkToNodeAPI } from "@aptos-labs/ts-sdk";

/**
 * CAIP-2 network identifier for Aptos Mainnet
 */
export const APTOS_MAINNET_CAIP2 = "aptos:1";

/**
 * CAIP-2 network identifier for Aptos Testnet
 */
export const APTOS_TESTNET_CAIP2 = "aptos:2";

/**
 * Regex pattern for validating Aptos addresses
 * Matches 64 hex characters with 0x prefix
 */
export const APTOS_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

/**
 * The primary fungible store transfer function
 */
export const TRANSFER_FUNCTION = "0x1::primary_fungible_store::transfer";

/**
 * Maps CAIP-2 network identifiers to Aptos SDK Network enum.
 *
 * @param network - The CAIP-2 network identifier (e.g., "aptos:1")
 * @returns The corresponding Aptos SDK Network enum value
 */
export function getAptosNetwork(network: string): Network {
  switch (network) {
    case APTOS_MAINNET_CAIP2:
      return Network.MAINNET;
    case APTOS_TESTNET_CAIP2:
      return Network.TESTNET;
    default:
      throw new Error(`Unsupported Aptos network: ${network}`);
  }
}

/**
 * Gets the default RPC URL for the given Aptos network.
 *
 * @param network - The Aptos SDK Network enum value
 * @returns The default RPC URL for the network
 */
export function getAptosRpcUrl(network: Network): string {
  return NetworkToNodeAPI[network];
}
