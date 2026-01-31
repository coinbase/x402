/**
 * 8004-Reputation Extension for x402
 *
 * This extension enables on-chain reputation for x402 agents through:
 * - Agent identity declaration (ERC-8004 compliant registries)
 * - Facilitator settlement attestation
 * - Feedback aggregation protocol
 *
 * ## Overview
 *
 * The reputation extension adds trust signals to x402 payment flows:
 *
 * 1. **Agent Identity**: Servers declare their ERC-8004 registration in PaymentRequired
 * 2. **Facilitator Attestation**: Facilitators can attest to successful settlements
 * 3. **Feedback Aggregation**: Gas-free feedback submission through trusted aggregators
 *
 * ## For Resource Servers (Agents)
 *
 * Declare reputation support in your route configuration:
 *
 * ```typescript
 * import { declareReputationExtension, REPUTATION } from '@x402/extensions/reputation';
 *
 * const extension = declareReputationExtension({
 *   registrations: [{
 *     agentRegistry: "eip155:8453:0x8004A818...",
 *     agentId: "42",
 *     reputationRegistry: "eip155:8453:0x8004B663..."
 *   }],
 *   feedbackAggregator: {
 *     endpoint: "https://x402.dexter.cash/feedback",
 *     gasSponsored: true
 *   }
 * });
 *
 * const routes = {
 *   "POST /api": {
 *     price: "$0.01",
 *     extensions: { [REPUTATION]: extension }
 *   }
 * };
 * ```
 *
 * ## For Facilitators
 *
 * Add attestation to settlement responses:
 *
 * ```typescript
 * import { createReputationServerExtension } from '@x402/extensions/reputation';
 *
 * const extension = createReputationServerExtension({
 *   attestation: {
 *     facilitatorId: "eip155:8453:0x8004F123...",
 *     sign: async (msg) => wallet.signMessage(msg)
 *   }
 * });
 *
 * server.registerExtension(extension);
 * ```
 *
 * ## For Clients
 *
 * Submit feedback after receiving service:
 *
 * ```typescript
 * import {
 *   createAndSubmitFeedback,
 *   extractReputationFromSettlement,
 *   extractReputationFromPaymentRequired
 * } from '@x402/extensions/reputation';
 *
 * // After settlement
 * const reputationInfo = extractReputationFromPaymentRequired(paymentRequired.extensions);
 * const settlementData = extractReputationFromSettlement(settlementResponse.extensions);
 *
 * if (reputationInfo?.feedbackAggregator) {
 *   await createAndSubmitFeedback({
 *     aggregatorEndpoint: reputationInfo.feedbackAggregator.endpoint,
 *     taskRef: settlementData.taskRef,
 *     facilitatorAttestation: settlementData.facilitatorAttestation,
 *     agentId: reputationInfo.registrations[0].agentId,
 *     reputationRegistry: reputationInfo.registrations[0].reputationRegistry,
 *     value: 95,
 *     tag1: "x402-delivered",
 *     tag2: "proof-of-settlement",
 *     clientAddress: myWallet.address,
 *     sign: myWallet.signMessage
 *   });
 * }
 * ```
 */

// Extension identifier
export { REPUTATION } from "./types";

// ============================================================================
// Types
// ============================================================================

export type {
  // Agent identity
  AgentRegistration,
  ReputationInfo,
  FeedbackAggregator,

  // Settlement response
  InteractionData,
  FacilitatorAttestation,
  ReputationSettlementExtension,

  // Feedback submission
  FeedbackSubmission,
  FeedbackResponse,
  FeedbackErrorCode,
  FeedbackTag1,
  FeedbackTag2,

  // Extension declaration
  ReputationRequiredExtension,
  ReputationInfoSchema,

  // Facilitator config
  FacilitatorAttestationConfig,
  FacilitatorSigner,
} from "./types";

// ============================================================================
// Server Extension (for resource servers and facilitators)
// ============================================================================

export {
  createReputationServerExtension,
  reputationServerExtension,
  declareReputationExtension,
} from "./server";

export type { ReputationServerExtensionConfig, DeclareReputationConfig } from "./server";

// ============================================================================
// Attestation Utilities
// ============================================================================

export {
  createAttestation,
  verifyAttestation,
  buildAttestationMessage,
  hashAttestationMessage,
  extractNetworkFromTaskRef,
  extractTxHashFromTaskRef,
  createTaskRef,
  validateAttestationData,
  encodeAttestation,
  decodeAttestation,
} from "./attestation";

export type {
  CreateAttestationParams,
  VerifyAttestationParams,
  VerifyAttestationResult,
} from "./attestation";

// ============================================================================
// Aggregator Client (for clients submitting feedback)
// ============================================================================

export {
  createFeedbackSubmission,
  submitFeedback,
  createAndSubmitFeedback,
  buildClientFeedbackMessage,
  hashClientFeedbackMessage,
  extractReputationFromSettlement,
  extractReputationFromPaymentRequired,
  getAggregatorEndpoint,
  determineEvidenceTag,
} from "./aggregator";

export type { CreateFeedbackParams } from "./aggregator";

// ============================================================================
// Facilitator Utilities (for facilitators and aggregators)
// ============================================================================

export {
  validateReputationExtension,
  extractReputationData,
  validateFeedbackSubmission,
  hasReputationExtension,
  getAgentRegistrations,
  getFeedbackAggregator,
  findRegistrationForNetwork,
  extractNetworkFromCaip10,
  extractAddressFromCaip10,
} from "./facilitator";

export type {
  ReputationValidationResult,
  ExtractedReputationData,
  ValidateFeedbackParams,
  ValidateFeedbackResult,
} from "./facilitator";
