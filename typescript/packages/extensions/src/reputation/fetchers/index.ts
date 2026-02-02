/**
 * Chain-specific Feedback Fetchers
 *
 * Factory pattern for fetching feedback from different blockchain networks.
 * Each chain type (EVM, Solana) has its own implementation.
 */
import type { FeedbackSubmission } from "../types";

/**
 * Interface for chain-specific feedback fetchers
 */
export interface ChainFeedbackFetcher {
  /**
   * Fetches feedback submissions for an agent from the on-chain reputation registry
   *
   * @param network - CAIP-2 network identifier
   * @param agentId - Agent identifier
   * @param reputationRegistry - CAIP-10 reputation registry address
   * @returns Array of feedback submissions
   */
  fetchFeedback(
    network: string,
    agentId: string,
    reputationRegistry: string,
  ): Promise<FeedbackSubmission[]>;
}

/**
 * Factory function to create the appropriate fetcher for a network
 *
 * @param network - CAIP-2 network identifier (e.g., "eip155:8453", "solana:5eykt4...")
 * @param rpcUrls - Map of network identifiers to RPC URLs
 * @returns ChainFeedbackFetcher instance
 * @throws Error if network is not supported
 */
export async function createFeedbackFetcher(
  network: string,
  rpcUrls: Record<string, string>,
): Promise<ChainFeedbackFetcher> {
  const namespace = network.split(":")[0];
  const rpcUrl = rpcUrls[network];

  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for network: ${network}`);
  }

  switch (namespace) {
    case "eip155": {
      // Lazy import to avoid requiring viem in all environments
      const { EVMFeedbackFetcher } = await import("./evm");
      return new EVMFeedbackFetcher(rpcUrl);
    }
    case "solana": {
      // Lazy import to avoid requiring @solana/web3.js in all environments
      const { SolanaFeedbackFetcher } = await import("./solana");
      return new SolanaFeedbackFetcher(rpcUrl);
    }
    default:
      throw new Error(`Unsupported namespace: ${namespace}`);
  }
}
