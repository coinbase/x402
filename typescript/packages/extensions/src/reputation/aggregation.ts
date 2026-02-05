/**
 * Cross-Chain Reputation Aggregation
 *
 * Aggregates reputation data from multiple blockchain networks
 * into a unified reputation score with weighted averaging.
 */
import type {
  AgentRegistration,
  FeedbackSubmission,
  CrossChainReputation,
} from "./types";
import { computeEvidenceLevel } from "./facilitator";
import { extractNetworkFromCaip10 } from "./facilitator";

/**
 * Parameters for aggregating cross-chain reputation
 */
export interface AggregateCrossChainReputationParams {
  /**
   * Agent registrations across different chains
   */
  registrations: AgentRegistration[];
  /**
   * Function to fetch feedback for a specific chain
   * Can use ChainFeedbackFetcher or custom implementation
   */
  fetchChainFeedback: (
    network: string,
    agentId: string,
    reputationRegistry: string,
  ) => Promise<FeedbackSubmission[]>;
}

/**
 * Aggregates reputation data from multiple chains
 *
 * Uses weighted averaging with time decay:
 * - More recent feedback has higher weight
 * - Higher evidence quality has higher weight
 * - Exponential decay with 90-day half-life
 *
 * @param params - Aggregation parameters
 * @returns Aggregated cross-chain reputation
 *
 * @example
 * ```typescript
 * const reputation = await aggregateCrossChainReputation({
 *   registrations: [
 *     {
 *       agentRegistry: "eip155:8453:0x8004A818...",
 *       agentId: "42",
 *       reputationRegistry: "eip155:8453:0x8004B663..."
 *     },
 *     {
 *       agentRegistry: "solana:5eykt4...:satiRkxE...",
 *       agentId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
 *       reputationRegistry: "solana:5eykt4...:satiRkxE..."
 *     }
 *   ],
 *   fetchChainFeedback: async (network, agentId, registry) => {
 *     const fetcher = createFeedbackFetcher(network, rpcUrls);
 *     return fetcher.fetchFeedback(network, agentId, registry);
 *   }
 * });
 * ```
 */
export async function aggregateCrossChainReputation(
  params: AggregateCrossChainReputationParams,
): Promise<CrossChainReputation> {
  const { registrations, fetchChainFeedback } = params;

  const chainBreakdown: Record<
    string,
    {
      feedbackCount: number;
      averageScore: number;
      evidenceQuality: number;
    }
  > = {};

  let totalFeedback: FeedbackSubmission[] = [];

  // Fetch feedback from all chains
  for (const reg of registrations) {
    const network = extractNetworkFromCaip10(reg.agentRegistry);
    if (!network) continue;

    try {
      const feedback = await fetchChainFeedback(network, reg.agentId, reg.reputationRegistry);

      totalFeedback = totalFeedback.concat(feedback);

      // Calculate chain-specific stats
      if (feedback.length > 0) {
        const averageScore =
          feedback.reduce((sum, f) => sum + f.value, 0) / feedback.length;

        const evidenceQuality =
          feedback.reduce((sum, f) => {
            const { score } = computeEvidenceLevel(f);
            return sum + score;
          }, 0) / feedback.length;

        chainBreakdown[network] = {
          feedbackCount: feedback.length,
          averageScore: Math.round(averageScore * 100) / 100,
          evidenceQuality: Math.round(evidenceQuality * 100) / 100,
        };
      }
    } catch (error) {
      console.warn(`Failed to fetch feedback for ${network}:`, error);
      // Continue with other chains
    }
  }

  // Calculate weighted score (more recent feedback = higher weight)
  const now = Date.now() / 1000;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const feedback of totalFeedback) {
    if (!feedback.facilitatorAttestation) {
      // Skip feedback without attestation for weighted calculation
      continue;
    }

    const age = now - feedback.facilitatorAttestation.settledAt;
    const { score: evidenceScore } = computeEvidenceLevel(feedback);

    // Exponential decay: half-life of 90 days
    // weight = e^(-age / (90 * 24 * 60 * 60)) * (evidenceScore / 100)
    const timeDecay = Math.exp(-age / (90 * 24 * 60 * 60));
    const evidenceWeight = evidenceScore / 100;
    const weight = timeDecay * evidenceWeight;

    weightedSum += feedback.value * weight;
    totalWeight += weight;
  }

  const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Use first registration's agentId (should be same across chains)
  const agentId = registrations[0]?.agentId ?? "";

  return {
    agentId,
    totalFeedbackCount: totalFeedback.length,
    weightedScore: Math.round(weightedScore * 100) / 100,
    chainBreakdown,
  };
}
