// Shared extension utilities
export { WithExtensions } from "./types";

// Bazaar extension
export * from "./bazaar";
export { bazaarResourceServerExtension } from "./bazaar/server";

// Sign-in-with-x extension
export * from "./sign-in-with-x";

// 8004-Reputation extension
// Export explicitly to avoid name collisions
export { REPUTATION } from "./reputation";
export {
  reputationServerExtension,
  createReputationServerExtension,
  declareReputationExtension,
} from "./reputation/server";
export {
  createAttestation,
  verifyAttestation,
  createTaskRef,
  extractNetworkFromTaskRef,
  extractTxHashFromTaskRef,
} from "./reputation/attestation";
export {
  createFeedbackSubmission,
  submitFeedback,
  createAndSubmitFeedback,
  extractReputationFromSettlement,
  extractReputationFromPaymentRequired,
  getAggregatorEndpoint,
  determineEvidenceTag,
} from "./reputation/aggregator";
export {
  validateReputationExtension,
  extractReputationData,
  validateFeedbackSubmission,
  hasReputationExtension,
  getAgentRegistrations,
  getFeedbackAggregator,
  findRegistrationForNetwork,
} from "./reputation/facilitator";

// Re-export reputation types with distinct names
export type {
  AgentRegistration,
  ReputationInfo,
  FeedbackAggregator,
  InteractionData,
  FacilitatorAttestation,
  ReputationSettlementExtension,
  FeedbackSubmission,
  FeedbackResponse,
  FacilitatorAttestationConfig,
  FacilitatorSigner,
  ReputationRequiredExtension,
} from "./reputation";

export type {
  ReputationValidationResult,
  ExtractedReputationData,
  ValidateFeedbackParams,
  ValidateFeedbackResult,
} from "./reputation/facilitator";

export type {
  CreateAttestationParams,
  VerifyAttestationParams,
  VerifyAttestationResult,
} from "./reputation/attestation";

export type { CreateFeedbackParams } from "./reputation/aggregator";

export type { ReputationServerExtensionConfig, DeclareReputationConfig } from "./reputation/server";
