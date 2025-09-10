import { Client } from "@hashgraph/sdk";
import { createHederaConnectedClient } from "./wallet";

/**
 * Gets a Hedera client for the specified network
 * 
 * @param network - The network identifier
 * @returns A Hedera client instance
 */
export function getHederaClient(network: string): Client {
  return createHederaConnectedClient(network);
}

/**
 * Gets the Hedera mirror node REST API URL for the specified network
 * 
 * @param network - The network identifier
 * @returns The mirror node REST API base URL
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