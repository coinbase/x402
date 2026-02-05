/**
 * Feedback Aggregator Client
 *
 * Utilities for submitting feedback to aggregator endpoints.
 * Aggregators handle gas-free, batched submission to on-chain Reputation Registries.
 */
/// <reference lib="dom" />
import type {
  FeedbackSubmission,
  FeedbackResponse,
  FacilitatorAttestation,
  ReputationInfo,
  ReputationSettlementExtension,
} from "./types";
import { REPUTATION } from "./types";
import { computeEvidenceLevel } from "./facilitator";

// Use globalThis for cross-platform compatibility
const encoder = new globalThis.TextEncoder();

// ============================================================================
// Client Signature Generation
// ============================================================================

/**
 * Builds the message that clients must sign for feedback submission
 *
 * Message format:
 * keccak256(UTF8(agentId) || UTF8(taskRef) || int128BE(value) || uint8(valueDecimals))
 *
 * @param agentId - Target agent identifier
 * @param taskRef - CAIP-220 payment transaction reference
 * @param value - Feedback score
 * @param valueDecimals - Decimal precision for value
 * @returns Message bytes to sign
 */
export function buildClientFeedbackMessage(
  agentId: string,
  taskRef: string,
  value: number,
  valueDecimals: number,
): Uint8Array {
  const agentIdBytes = encoder.encode(agentId);
  const taskRefBytes = encoder.encode(taskRef);

  // value as 16-byte big-endian (int128)
  // Note: JavaScript numbers are 64-bit, so we use BigInt for safety
  const valueBytes = new Uint8Array(16);
  const valueView = new DataView(valueBytes.buffer);
  // For simplicity, store as int64 in the high bytes
  valueView.setBigInt64(8, BigInt(Math.floor(value)), false);

  // valueDecimals as 1 byte
  const decimalsBytes = new Uint8Array([valueDecimals]);

  // Concatenate
  const totalLength =
    agentIdBytes.length + taskRefBytes.length + valueBytes.length + decimalsBytes.length;
  const message = new Uint8Array(totalLength);
  let offset = 0;
  message.set(agentIdBytes, offset);
  offset += agentIdBytes.length;
  message.set(taskRefBytes, offset);
  offset += taskRefBytes.length;
  message.set(valueBytes, offset);
  offset += valueBytes.length;
  message.set(decimalsBytes, offset);
  return message;
}

/**
 * Hash the client feedback message
 * Uses SHA-256 (replace with keccak256 in production)
 *
 * @param message - The message bytes to hash
 * @returns SHA-256 hash of the message as Uint8Array
 */
export async function hashClientFeedbackMessage(message: Uint8Array): Promise<Uint8Array> {
  // Note: We create a new ArrayBuffer to ensure compatibility with strict TypeScript settings
  const buffer = new ArrayBuffer(message.length);
  new Uint8Array(buffer).set(message);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hashBuffer);
}

// ============================================================================
// Feedback Submission
// ============================================================================

/**
 * Parameters for creating a feedback submission
 */
export interface CreateFeedbackParams {
  // From settlement response
  taskRef: string;
  interactionHash?: string;
  agentSignature?: string;
  facilitatorAttestation?: FacilitatorAttestation;
  // Target agent
  agentId: string;
  reputationRegistry: string;
  // Feedback content
  value: number;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  comment?: string;
  // Client info
  clientAddress: string;
  // Client signing function
  sign: (message: Uint8Array) => Promise<string>;
}

/**
 * Creates a signed feedback submission
 *
 * @param params - Feedback parameters
 * @returns Complete signed feedback submission
 *
 * @example
 * ```typescript
 * const feedback = await createFeedbackSubmission({
 *   taskRef: settlementResponse.extensions["8004-reputation"].taskRef,
 *   agentSignature: settlementResponse.extensions["8004-reputation"].agentSignature,
 *   agentId: "42",
 *   reputationRegistry: "eip155:8453:0x8004B663...",
 *   value: 95,
 *   tag1: "x402-delivered",
 *   tag2: "proof-of-service",
 *   clientAddress: "eip155:8453:0x857b0651...",
 *   sign: async (msg) => wallet.signMessage(msg)
 * });
 * ```
 */
export async function createFeedbackSubmission(
  params: CreateFeedbackParams,
): Promise<FeedbackSubmission> {
  const {
    taskRef,
    interactionHash,
    agentSignature,
    facilitatorAttestation,
    agentId,
    reputationRegistry,
    value,
    valueDecimals = 0,
    tag1,
    tag2,
    comment,
    clientAddress,
    sign,
  } = params;

  // Build and sign the feedback message
  const message = buildClientFeedbackMessage(agentId, taskRef, value, valueDecimals);
  const hash = await hashClientFeedbackMessage(message);
  const clientSignature = await sign(hash);

  const submission: FeedbackSubmission = {
    taskRef,
    agentId,
    reputationRegistry,
    value,
    valueDecimals,
    clientAddress,
    clientSignature,
  };

  // Add optional fields
  if (interactionHash) submission.interactionHash = interactionHash;
  if (agentSignature) submission.agentSignature = agentSignature;
  if (facilitatorAttestation) submission.facilitatorAttestation = facilitatorAttestation;
  if (tag1) submission.tag1 = tag1;
  if (tag2) submission.tag2 = tag2;
  if (comment) submission.comment = comment;

  // Auto-compute evidence level and score
  const { level, score } = computeEvidenceLevel(submission);
  submission.evidenceLevel = level;
  submission.evidenceScore = score;

  return submission;
}

/**
 * Submits feedback to an aggregator endpoint
 *
 * @param endpoint - Aggregator endpoint URL
 * @param submission - Signed feedback submission
 * @returns Aggregator response
 *
 * @example
 * ```typescript
 * const response = await submitFeedback(
 *   "https://x402.dexter.cash/feedback",
 *   feedback
 * );
 *
 * if (response.accepted) {
 *   console.log("Feedback queued:", response.feedbackId);
 * } else {
 *   console.error("Submission failed:", response.error);
 * }
 * ```
 */
export async function submitFeedback(
  endpoint: string,
  submission: FeedbackSubmission,
): Promise<FeedbackResponse> {
  const response = await globalThis.fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(submission),
  });

  const data = (await response.json()) as FeedbackResponse;

  // Handle HTTP errors
  if (!response.ok && !data.error) {
    return {
      accepted: false,
      error: "http_error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  return data;
}

/**
 * Parameters for submitting to multiple aggregators
 */
export interface SubmitToMultipleAggregatorsParams {
  /**
   * Array of aggregator endpoint URLs
   */
  endpoints: string[];
  /**
   * The feedback submission to send
   */
  submission: FeedbackSubmission;
  /**
   * Minimum number of successful submissions required
   *
   * @default 1
   */
  minimumSuccessful?: number;
}

/**
 * Submits feedback to multiple aggregators in parallel
 *
 * @param params - Submission parameters
 * @returns Results from all aggregators
 */
export async function submitToMultipleAggregators(
  params: SubmitToMultipleAggregatorsParams,
): Promise<{
  successful: number;
  failed: number;
  results: Array<{ endpoint: string; response: FeedbackResponse }>;
}> {
  const { endpoints, submission, minimumSuccessful = 1 } = params;

  const promises = endpoints.map(async endpoint => {
    try {
      const response = await submitFeedback(endpoint, submission);
      return { endpoint, response };
    } catch (error) {
      return {
        endpoint,
        response: {
          accepted: false,
          error: "submission_failed",
          message: error instanceof Error ? error.message : String(error),
        } as FeedbackResponse,
      };
    }
  });

  const results = await Promise.all(promises);
  const successful = results.filter(r => r.response.accepted).length;
  const failed = results.length - successful;

  if (successful < minimumSuccessful) {
    throw new Error(
      `Only ${successful}/${endpoints.length} aggregators accepted feedback (minimum: ${minimumSuccessful})`,
    );
  }

  return { successful, failed, results };
}

// ============================================================================
// Extraction Helpers
// ============================================================================

/**
 * Extracts reputation data from a settlement response for feedback submission
 *
 * @param settlementExtensions - Extensions from settlement response
 * @returns Reputation extension data or null
 */
export function extractReputationFromSettlement(
  settlementExtensions?: Record<string, unknown>,
): ReputationSettlementExtension | null {
  if (!settlementExtensions) return null;
  const reputation = settlementExtensions[REPUTATION];
  if (!reputation || typeof reputation !== "object") return null;
  return reputation as ReputationSettlementExtension;
}

/**
 * Extracts reputation info from PaymentRequired response
 *
 * @param paymentRequiredExtensions - Extensions from 402 response
 * @returns ReputationInfo or null
 */
export function extractReputationFromPaymentRequired(
  paymentRequiredExtensions?: Record<string, unknown>,
): ReputationInfo | null {
  if (!paymentRequiredExtensions) return null;
  const reputation = paymentRequiredExtensions[REPUTATION];
  if (!reputation || typeof reputation !== "object") return null;
  const ext = reputation as { info?: ReputationInfo };
  return ext.info ?? null;
}

/**
 * Gets the feedback aggregator endpoint from PaymentRequired
 *
 * @param paymentRequiredExtensions - Extensions from 402 response
 * @returns Aggregator endpoint URL or null
 */
export function getAggregatorEndpoint(
  paymentRequiredExtensions?: Record<string, unknown>,
): string | null {
  const info = extractReputationFromPaymentRequired(paymentRequiredExtensions);
  return info?.feedbackAggregator?.endpoint ?? null;
}

/**
 * Gets all aggregator endpoints (primary + fallbacks) from PaymentRequired
 *
 * @param paymentRequiredExtensions - Extensions from 402 response
 * @returns Array of aggregator endpoint URLs
 */
export function getAllAggregatorEndpoints(
  paymentRequiredExtensions?: Record<string, unknown>,
): string[] {
  const info = extractReputationFromPaymentRequired(paymentRequiredExtensions);
  if (!info?.feedbackAggregator) return [];

  const endpoints = [info.feedbackAggregator.endpoint];
  if (info.feedbackAggregator.fallbackEndpoints) {
    endpoints.push(...info.feedbackAggregator.fallbackEndpoints);
  }
  return endpoints;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Complete flow: Create and submit feedback in one call
 *
 * @param params - Feedback parameters including aggregator endpoint
 * @returns Aggregator response
 *
 * @example
 * ```typescript
 * // After receiving settlement response
 * const response = await createAndSubmitFeedback({
 *   aggregatorEndpoint: reputationInfo.feedbackAggregator.endpoint,
 *   taskRef: settlementExtension.taskRef,
 *   agentSignature: settlementExtension.agentSignature,
 *   facilitatorAttestation: settlementExtension.facilitatorAttestation,
 *   agentId: reputationInfo.registrations[0].agentId,
 *   reputationRegistry: reputationInfo.registrations[0].reputationRegistry,
 *   value: 95,
 *   tag1: "x402-delivered",
 *   tag2: "proof-of-settlement",
 *   clientAddress: myWalletAddress,
 *   sign: wallet.signMessage
 * });
 * ```
 */
export async function createAndSubmitFeedback(
  params: CreateFeedbackParams & {
    aggregatorEndpoint: string;
    fallbackEndpoints?: string[];
    minimumSuccessful?: number;
  },
): Promise<FeedbackResponse> {
  const {
    aggregatorEndpoint,
    fallbackEndpoints,
    minimumSuccessful = 1,
    ...feedbackParams
  } = params;

  const submission = await createFeedbackSubmission(feedbackParams);

  // If no fallbacks, use single submission
  if (!fallbackEndpoints || fallbackEndpoints.length === 0) {
    return submitFeedback(aggregatorEndpoint, submission);
  }

  // Use multi-aggregator submission
  const allEndpoints = [aggregatorEndpoint, ...fallbackEndpoints];
  const result = await submitToMultipleAggregators({
    endpoints: allEndpoints,
    submission,
    minimumSuccessful,
  });

  // Return the first successful response
  const firstSuccess = result.results.find(r => r.response.accepted);
  return firstSuccess?.response || result.results[0].response;
}

/**
 * Determines the appropriate tag2 based on available proofs
 *
 * @param hasAgentSignature - Whether agent signature is available
 * @param hasFacilitatorAttestation - Whether facilitator attestation is available
 * @returns Recommended tag2 value
 */
export function determineEvidenceTag(
  hasAgentSignature: boolean,
  hasFacilitatorAttestation: boolean,
): string {
  if (hasFacilitatorAttestation) {
    return "proof-of-settlement";
  }
  if (hasAgentSignature) {
    return "proof-of-service";
  }
  return "proof-of-payment";
}
