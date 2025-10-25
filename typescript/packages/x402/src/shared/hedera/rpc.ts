import { Client } from "@hashgraph/sdk";
import { createHederaConnectedClient } from "./wallet";

/**
 * Gets a Hedera client for the specified network.
 * 
 * This is a convenience function that wraps createHederaConnectedClient
 * for consistent API usage across the codebase.
 * 
 * @param network - The network identifier ("hedera-testnet" or "hedera-mainnet")
 * @returns A Hedera client instance configured for the specified network
 * @throws Error if the network is not supported
 * 
 * @example
 * ```typescript
 * const client = getHederaClient("hedera-testnet");
 * const balance = await client.getAccountBalance(accountId);
 * ```
 */
export function getHederaClient(network: string): Client {
  return createHederaConnectedClient(network);
}

/**
 * Gets the Hedera mirror node REST API URL for the specified network.
 * 
 * The Hedera mirror node provides REST API access to historical transaction data,
 * account information, and other blockchain data without requiring consensus node access.
 * 
 * @param network - The network identifier ("hedera-testnet" or "hedera-mainnet")
 * @returns The mirror node REST API base URL for the specified network
 * @throws Error if the network is not supported
 * 
 * @example
 * ```typescript
 * const mirrorUrl = getMirrorNodeUrl("hedera-testnet");
 * // Returns: "https://testnet.mirrornode.hedera.com"
 * 
 * // Use with fetch API
 * const response = await fetch(`${mirrorUrl}/api/v1/accounts/${accountId}`);
 * ```
 */
export function getMirrorNodeUrl(network: string): string {
  if (network === "hedera-testnet") {
    return "https://testnet.mirrornode.hedera.com";
  } else if (network === "hedera-mainnet") {
    return "https://mainnet-public.mirrornode.hedera.com";
  } else {
    throw new Error(`Unsupported Hedera network: ${network}`);
  }
}