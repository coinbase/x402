/**
 * EVM Feedback Fetcher
 *
 * Fetches feedback from ERC-8004 ReputationRegistry contracts on EVM chains.
 */
import type { ChainFeedbackFetcher } from "./index";
import type { FeedbackSubmission } from "../types";

/**
 * EVM-specific feedback fetcher implementation
 */
export class EVMFeedbackFetcher implements ChainFeedbackFetcher {
  constructor(private readonly rpcUrl: string) {}

  /**
   * Fetches feedback from an EVM ReputationRegistry contract
   *
   * @param network - CAIP-2 network identifier
   * @param agentId - Agent identifier (ERC-721 tokenId)
   * @param reputationRegistry - CAIP-10 reputation registry address
   * @returns Array of feedback submissions
   */
  async fetchFeedback(
    network: string,
    agentId: string,
    reputationRegistry: string,
  ): Promise<FeedbackSubmission[]> {
    // Extract contract address from CAIP-10
    const parts = reputationRegistry.split(":");
    if (parts.length < 3) {
      throw new Error(`Invalid CAIP-10 reputation registry: ${reputationRegistry}`);
    }
    const contractAddress = parts[2] as `0x${string}`;

    // TODO: Implement actual contract querying using viem
    // This would involve:
    // 1. Creating a PublicClient with the RPC URL
    // 2. Querying the ReputationRegistry contract's getSummary() or similar function
    // 3. Parsing events/logs for FeedbackGiven events
    // 4. Converting on-chain data to FeedbackSubmission format

    // For now, return empty array as placeholder
    // In production, this would query the actual contract:
    //
    // import { createPublicClient, http } from "viem";
    // import { baseSepolia } from "viem/chains";
    //
    // const client = createPublicClient({
    //   chain: baseSepolia, // or determine from network
    //   transport: http(this.rpcUrl),
    // });
    //
    // const summary = await client.readContract({
    //   address: contractAddress,
    //   abi: ERC8004_REPUTATION_REGISTRY_ABI,
    //   functionName: "getSummary",
    //   args: [agentId],
    // });
    //
    // // Convert summary to FeedbackSubmission[]
    // return convertSummaryToFeedbackSubmissions(summary);

    return [];
  }
}
