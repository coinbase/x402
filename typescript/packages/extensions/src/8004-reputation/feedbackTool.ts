import { type SettleResponse } from "@x402/core/types";
import { type ReputationInfo, ERC8004_REPUTATION } from "./types";
import { type FeedbackFile, FeedbackFileSchema } from "./feedback";

/**
 * Options for creating a feedback file.
 */
export interface CreateFeedbackOptions {
  /** The settlement response from the facilitator */
  settleResponse: SettleResponse;
  /** The server's reputation info (containing its identity) */
  serverReputation: ReputationInfo;
  /** The reputation score (0-100 or specific to valueDecimals) */
  value: number;
  /** Decimals for the value (default: 0) */
  valueDecimals?: number;
  /** Optional tags for filtering */
  tag1?: string;
  /** Optional tags for filtering */
  tag2?: string;
  /** Optional comment/detailed feedback */
  comment?: string;
}

/**
 * Helper to create a standardized ERC-8004 feedback file from an x402 settlement.
 *
 * This tool automates the extraction of network identifiers and transaction
 * hashes into the CAIP-220 compliant taskRef format.
 *
 * @param options - Options for creating the feedback file.
 * @returns A validated feedback file for standardized reporting.
 */
export function createFeedbackFile(options: CreateFeedbackOptions): FeedbackFile {
  const { settleResponse, serverReputation, value, valueDecimals = 0, tag1, tag2 } = options;

  // Construct CAIP-220 taskRef: {namespace}:{chainId}:tx/{hash}
  // settleResponse.network is already CAIP-2 (e.g., eip155:8453)
  const taskRef = `${settleResponse.network}:tx/${settleResponse.transaction}`;

  const feedback: FeedbackFile = {
    agentRegistry: serverReputation.identity.agentRegistry,
    agentId: serverReputation.identity.agentId,
    clientAddress: settleResponse.payer || "unknown",
    createdAt: new Date().toISOString(),
    value,
    valueDecimals,
    tag1,
    tag2,
    endpoint: serverReputation.endpoint,
    proofOfPayment: {
      fromAddress: settleResponse.payer || "unknown",
      toAddress: "unknown", // Normally extracted from paymentRequirements if available
      chainId: settleResponse.network.split(":")[1] || "unknown",
      txHash: settleResponse.transaction,
    },
    participation: {
      taskRef,
    },
  };

  // Validate against schema
  return FeedbackFileSchema.parse(feedback);
}

/**
 * Extracts ERC-8004 identity from a PaymentRequired response.
 *
 * @param extensions - The extensions object from the PaymentRequired response.
 * @returns The reputation info if present, otherwise undefined.
 */
export function getAgentReputation(
  extensions: Record<string, unknown>,
): ReputationInfo | undefined {
  const extension = extensions[ERC8004_REPUTATION] as { info: ReputationInfo } | undefined;
  return extension?.info;
}
