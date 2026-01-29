/**
 * Type definitions for the 8004-Reputation Extension
 *
 * This extension enables on-chain reputation for x402 agents through:
 * - Agent identity declaration (ERC-8004 compliant)
 * - Facilitator settlement attestation
 * - Feedback aggregation protocol
 */

/**
 * Extension identifier constant
 */
export const REPUTATION = "8004-reputation";

// ============================================================================
// Agent Identity Types (from PaymentRequired)
// ============================================================================

/**
 * Agent registration on an ERC-8004 compliant registry
 */
export interface AgentRegistration {
  /**
   * CAIP-10 format: {namespace}:{chainId}:{identityRegistry}
   * Examples:
   * - EVM: "eip155:8453:0x8004A818BFB912233c491871b3d84c89A494BD9e"
   * - Solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:satiRkxEiwZ51cv8PRu8UMzuaqeaNU9jABo6oAFMsLe"
   */
  agentRegistry: string;

  /**
   * Agent identifier:
   * - EVM: ERC-721 tokenId from the Identity Registry
   * - Solana: Agent account/mint address
   */
  agentId: string;

  /**
   * CAIP-10 Reputation Registry address
   * May equal agentRegistry on Solana where one program handles both
   */
  reputationRegistry: string;
}

/**
 * Feedback aggregator configuration
 */
export interface FeedbackAggregator {
  /**
   * HTTPS endpoint accepting feedback submissions
   */
  endpoint: string;

  /**
   * CAIP-2 networks the aggregator supports for on-chain submission
   */
  networks?: string[];

  /**
   * Whether aggregator pays submission gas
   * @default false
   */
  gasSponsored?: boolean;
}

/**
 * Reputation info declared by server in PaymentRequired
 */
export interface ReputationInfo {
  /**
   * Extension version
   */
  version: string;

  /**
   * Agent registrations (at least one required)
   */
  registrations: AgentRegistration[];

  /**
   * Agent's service endpoint URL
   */
  endpoint?: string;

  /**
   * Optional feedback aggregator for gas-free submission
   */
  feedbackAggregator?: FeedbackAggregator;
}

// ============================================================================
// Settlement Response Types (PAYMENT-RESPONSE)
// ============================================================================

/**
 * Interaction data included in settlement response
 * Agent signs this to prove service delivery
 */
export interface InteractionData {
  /**
   * CAIP-2 payment network (convenience field)
   */
  networkId: string;

  /**
   * Agent identifier on this network
   */
  agentId: string;

  /**
   * CAIP-220 payment transaction reference
   */
  taskRef: string;

  /**
   * keccak256(UTF8(taskRef) || UTF8(requestBody) || UTF8(responseBody))
   * Hex-encoded
   */
  interactionHash: string;

  /**
   * Agent signature over interactionHash
   * Hex-encoded
   */
  agentSignature: string;

  /**
   * Unix timestamp (metadata, not part of signed message)
   */
  timestamp: number;
}

/**
 * Facilitator attestation proving settlement occurred
 * Signed by the facilitator that executed the payment
 */
export interface FacilitatorAttestation {
  /**
   * CAIP-10 facilitator identifier
   * If registered: "eip155:8453:0x..."
   * If not: fee payer address "solana:5eykt4...:FeePayerAddress..."
   */
  facilitatorId: string;

  /**
   * Unix timestamp of settlement
   */
  settledAt: number;

  /**
   * Amount in atomic units
   */
  settledAmount: string;

  /**
   * Token address/mint that was transferred
   */
  settledAsset: string;

  /**
   * Recipient address
   */
  payTo: string;

  /**
   * Payer address
   */
  payer: string;

  /**
   * Facilitator signature over attestation
   * message = keccak256(taskRef || settledAmount || settledAsset || payTo || payer || settledAt)
   */
  attestationSignature: string;
}

/**
 * Complete reputation extension data in settlement response
 */
export interface ReputationSettlementExtension {
  /**
   * Interaction data with agent signature (if agent provides)
   */
  networkId?: string;
  agentId?: string;
  taskRef?: string;
  interactionHash?: string;
  agentSignature?: string;
  timestamp?: number;

  /**
   * Facilitator attestation (if facilitator provides)
   */
  facilitatorAttestation?: FacilitatorAttestation;
}

// ============================================================================
// Feedback Submission Types
// ============================================================================

/**
 * Feedback submission to aggregator endpoint
 */
export interface FeedbackSubmission {
  // From PAYMENT-RESPONSE
  taskRef: string;
  interactionHash?: string;
  agentSignature?: string;

  // Target agent
  agentId: string;
  reputationRegistry: string;

  // Feedback content
  value: number;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  comment?: string;

  // Client proof
  clientAddress: string;
  clientSignature: string;

  // Optional facilitator attestation
  facilitatorAttestation?: FacilitatorAttestation;
}

/**
 * Aggregator response to feedback submission
 */
export interface FeedbackResponse {
  accepted: boolean;
  feedbackId?: string;
  status?: "queued" | "submitted" | "confirmed";
  estimatedOnChainTime?: string;
  error?: string;
  message?: string;
}

/**
 * Standard error codes from aggregator
 */
export type FeedbackErrorCode =
  | "invalid_task_ref"
  | "invalid_client_signature"
  | "invalid_agent_signature"
  | "duplicate_feedback"
  | "unsupported_network"
  | "rate_limited";

// ============================================================================
// Extension Declaration Types
// ============================================================================

/**
 * Full extension structure in PaymentRequired
 */
export interface ReputationRequiredExtension {
  info: ReputationInfo;
  schema: ReputationInfoSchema;
}

/**
 * JSON Schema for ReputationInfo validation
 */
export interface ReputationInfoSchema {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  type: "object";
  properties: {
    version: {
      type: "string";
      pattern: string;
    };
    registrations: {
      type: "array";
      minItems: 1;
      items: {
        type: "object";
        properties: {
          agentRegistry: { type: "string" };
          agentId: { type: "string" };
          reputationRegistry: { type: "string" };
        };
        required: ["agentRegistry", "agentId", "reputationRegistry"];
      };
    };
    endpoint?: {
      type: "string";
      format: "uri";
    };
    feedbackAggregator?: {
      type: "object";
      properties: {
        endpoint: { type: "string"; format: "uri" };
        networks: { type: "array"; items: { type: "string" } };
        gasSponsored: { type: "boolean" };
      };
      required: ["endpoint"];
    };
  };
  required: ["version", "registrations"];
}

// ============================================================================
// Facilitator Configuration Types
// ============================================================================

/**
 * Configuration for facilitator attestation
 */
export interface FacilitatorAttestationConfig {
  /**
   * CAIP-10 facilitator identifier
   */
  facilitatorId: string;

  /**
   * Signing function for attestation
   * Should sign the message and return hex-encoded signature
   */
  sign: (message: Uint8Array) => Promise<string>;

  /**
   * Signing algorithm
   * @default "secp256k1"
   */
  algorithm?: "secp256k1" | "ed25519";
}

/**
 * Signer information from facilitator registration file
 */
export interface FacilitatorSigner {
  publicKey: string;
  algorithm: "secp256k1" | "ed25519";
  role: "owner" | "delegate";
  validFrom: number;
  validUntil: number | null;
  comment?: string;
}

// ============================================================================
// Tag Conventions
// ============================================================================

/**
 * Standard tag1 values for x402 feedback
 */
export type FeedbackTag1 =
  | "x402-delivered"
  | "x402-failed"
  | "x402-timeout"
  | "x402-quality"
  | "x402-payment-verified";

/**
 * Standard tag2 values for evidence level
 */
export type FeedbackTag2 =
  | "proof-of-payment"
  | "proof-of-service"
  | "proof-of-settlement"
  | "client-claim";
