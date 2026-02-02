/**
 * Facilitator-side Reputation Extension Utilities
 *
 * Functions for facilitators to:
 * - Validate reputation extension data
 * - Extract agent identity information
 * - Process feedback submissions (for aggregators)
 * - Compute evidence levels
 * - Validate facilitator identities (cross-chain)
 */
import Ajv from "ajv/dist/2020.js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  ReputationInfo,
  ReputationRequiredExtension,
  FeedbackSubmission,
  AgentRegistration,
  EvidenceLevel,
  RateLimitConfig,
  FacilitatorIdentity,
  FacilitatorSigner,
  CrossChainReputation,
} from "./types";
import { REPUTATION } from "./types";

// ============================================================================
// Evidence Level Computation
// ============================================================================

/**
 * Computes evidence level and score for a feedback submission
 *
 * @param submission - The feedback submission to evaluate
 * @returns Evidence level and score (0-100)
 */
export function computeEvidenceLevel(
  submission: FeedbackSubmission,
): { level: EvidenceLevel; score: number } {
  let level = EvidenceLevel.NONE;
  let score = 0;

  // Base level: Payment proof (taskRef)
  if (submission.taskRef) {
    level = EvidenceLevel.PAYMENT;
    score = 25;
  }

  // Level 2: Settlement proof (facilitator attestation)
  if (submission.facilitatorAttestation) {
    level = EvidenceLevel.SETTLEMENT;
    score = 50;

    // Bonus for recent attestation (decay over time)
    const now = Math.floor(Date.now() / 1000);
    const age = now - submission.facilitatorAttestation.settledAt;
    const ageBonus = Math.max(0, 10 - Math.floor(age / (24 * 60 * 60))); // -1 per day, max 10
    score += ageBonus;

    // Check if attestation is still valid
    if (submission.facilitatorAttestation.validUntil >= now) {
      score += 5; // Bonus for non-expired attestation
    }
  }

  // Level 3: Service proof (agent signature + interaction hash)
  if (submission.agentSignature && submission.interactionHash) {
    level = EvidenceLevel.SERVICE;
    score = 75;
  }

  // Level 4: Full proof (service + settlement, both recent)
  if (
    level === EvidenceLevel.SERVICE &&
    submission.facilitatorAttestation
  ) {
    const now = Math.floor(Date.now() / 1000);
    const attestationAge = now - submission.facilitatorAttestation.settledAt;
    if (attestationAge < 60 * 60) {
      // Within 1 hour
      level = EvidenceLevel.FULL;
      score = 100;
    } else {
      // Still full proof but with time decay
      score = 90 - Math.floor(attestationAge / (60 * 60)); // -1 per hour after first hour
      score = Math.max(75, score); // Don't go below SERVICE level
    }
  }

  return { level, score };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result for reputation extensions
 */
export interface ReputationValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validates a reputation extension's info against its schema
 *
 * @param extension - The reputation extension containing info and schema
 * @returns Validation result
 */
export function validateReputationExtension(
  extension: ReputationRequiredExtension,
): ReputationValidationResult {
  try {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(extension.schema);
    const valid = validate(extension.info);
    if (valid) {
      return { valid: true };
    }
    const errors =
      validate.errors?.map(err => {
        const path = err.instancePath || "(root)";
        return `${path}: ${err.message}`;
      }) || ["Unknown validation error"];
    return { valid: false, errors };
  } catch (error) {
    return {
      valid: false,
      errors: [
        `Schema validation failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

// ============================================================================
// Extraction
// ============================================================================

/**
 * Extracted reputation data from payment flow
 */
export interface ExtractedReputationData {
  /**
   * Agent's reputation info from PaymentRequired
   */
  agentInfo: ReputationInfo;
  /**
   * Registration matching the payment network (if found)
   */
  matchingRegistration?: AgentRegistration;
  /**
   * Resource URL being paid for
   */
  resourceUrl: string;
  /**
   * x402 version
   */
  x402Version: number;
}

/**
 * Extracts reputation data from payment payload
 *
 * @param paymentPayload - The payment payload from client
 * @param paymentRequirements - The payment requirements
 * @param validate - Whether to validate against schema (default: true)
 * @returns Extracted data or null if not present/invalid
 */
export function extractReputationData(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  validate: boolean = true,
): ExtractedReputationData | null {
  // Only support v2
  if (paymentPayload.x402Version !== 2) {
    return null;
  }

  // Check for reputation extension
  if (!paymentPayload.extensions) {
    return null;
  }

  const reputationExt = paymentPayload.extensions[REPUTATION];
  if (!reputationExt || typeof reputationExt !== "object") {
    return null;
  }

  try {
    const extension = reputationExt as ReputationRequiredExtension;

    // Validate if requested
    if (validate && extension.schema) {
      const result = validateReputationExtension(extension);
      if (!result.valid) {
        console.warn(`Reputation extension validation failed: ${result.errors?.join(", ")}`);
        return null;
      }
    }

    const agentInfo = extension.info;
    if (!agentInfo?.registrations?.length) {
      return null;
    }

    // Find registration matching the payment network
    const paymentNetwork = paymentRequirements.network;
    const matchingRegistration = agentInfo.registrations.find(reg => {
      // Extract network from CAIP-10 agentRegistry
      // Format: "{namespace}:{chainId}:{address}"
      const parts = reg.agentRegistry.split(":");
      if (parts.length >= 2) {
        const regNetwork = `${parts[0]}:${parts[1]}`;
        return regNetwork === paymentNetwork;
      }
      return false;
    });

    return {
      agentInfo,
      matchingRegistration,
      resourceUrl: paymentPayload.resource?.url ?? "",
      x402Version: paymentPayload.x402Version,
    };
  } catch (error) {
    console.warn(`Failed to extract reputation data: ${error}`);
    return null;
  }
}

// ============================================================================
// Cross-Chain Address Utilities
// ============================================================================

/**
 * Normalizes addresses for cross-chain comparison
 *
 * @param address - Address to normalize
 * @param namespace - Chain namespace (eip155, solana, etc.)
 * @returns Normalized address
 */
export function normalizeAddress(address: string, namespace: string): string {
  switch (namespace) {
    case "eip155":
      // EVM: lowercase hex, remove 0x prefix for comparison
      return address.toLowerCase().replace(/^0x/, "");
    case "solana":
      // Solana: base58 is case-sensitive, no normalization
      return address;
    default:
      // Unknown chain: return as-is
      return address;
  }
}

/**
 * Validates signer algorithm matches network requirements
 *
 * @param algorithm - Signing algorithm
 * @param namespace - Chain namespace
 * @returns True if algorithm is valid for the namespace
 */
export function validateSignerAlgorithm(
  algorithm: "secp256k1" | "ed25519",
  namespace: string,
): boolean {
  const validAlgorithms: Record<string, string[]> = {
    eip155: ["secp256k1"],
    solana: ["ed25519"],
  };

  return validAlgorithms[namespace]?.includes(algorithm) ?? false;
}

/**
 * Extracts namespace from CAIP-10 identifier
 *
 * @param caip10 - CAIP-10 format: "{namespace}:{chainId}:{address}"
 * @returns Namespace (e.g., "eip155", "solana")
 */
export function extractNamespace(caip10: string): string {
  return caip10.split(":")[0];
}

/**
 * Extracts address from CAIP-10 format
 *
 * @param caip10Address - Format: "{namespace}:{chainId}:{address}"
 * @returns The address part or the original string
 */
export function extractAddressFromCaip10(caip10Address: string): string {
  const parts = caip10Address.split(":");
  if (parts.length >= 3) {
    return parts.slice(2).join(":"); // Handle addresses with colons
  }
  return caip10Address;
}

/**
 * Extracts network from CAIP-10 address
 *
 * @param caip10Address - Format: "{namespace}:{chainId}:{address}"
 * @returns CAIP-2 network or null
 */
export function extractNetworkFromCaip10(caip10Address: string): string | null {
  const parts = caip10Address.split(":");
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return null;
}

// ============================================================================
// Facilitator Identity Validation
// ============================================================================

/**
 * Parameters for validating facilitator identity
 */
export interface ValidateFacilitatorIdentityParams {
  /**
   * CAIP-10 facilitator identifier
   */
  facilitatorId: string;
  /**
   * Optional ERC-8004 facilitator identity
   */
  identity?: FacilitatorIdentity;
  /**
   * Function to fetch and verify ERC-8004 registration
   */
  fetchRegistration: (registrationFile: string) => Promise<{
    type: string;
    agentId: string;
    signers: FacilitatorSigner[];
  }>;
}

/**
 * Validates facilitator ERC-8004 identity
 *
 * @param params - Validation parameters
 * @returns Validation result
 */
export async function validateFacilitatorIdentity(
  params: ValidateFacilitatorIdentityParams,
): Promise<{ valid: boolean; error?: string }> {
  const { facilitatorId, identity, fetchRegistration } = params;

  // Identity is optional, so absence is valid
  if (!identity) {
    return { valid: true };
  }

  try {
    // Fetch registration file
    const registration = await fetchRegistration(identity.registrationFile);

    // Verify it's an ERC-8004 registration
    if (registration.type !== "https://eips.ethereum.org/EIPS/eip-8004#registration-v1") {
      return { valid: false, error: "Invalid ERC-8004 registration type" };
    }

    // Verify agentId matches
    if (registration.agentId !== identity.agentId) {
      return { valid: false, error: "Agent ID mismatch in registration" };
    }

    // Extract namespace and address from CAIP-10
    const parts = facilitatorId.split(":");
    if (parts.length < 3) {
      return { valid: false, error: "Invalid CAIP-10 facilitatorId" };
    }

    const namespace = parts[0];
    const address = parts.slice(2).join(":");

    // Check if facilitator is listed as a signer
    const hasSigner = registration.signers.some(signer => {
      // Validate algorithm matches namespace
      if (!validateSignerAlgorithm(signer.algorithm, namespace)) {
        return false;
      }

      // Normalize addresses for comparison
      const normalizedSignerKey = normalizeAddress(signer.publicKey, namespace);
      const normalizedFacilitatorAddress = normalizeAddress(address, namespace);

      return normalizedSignerKey === normalizedFacilitatorAddress;
    });

    if (!hasSigner) {
      return {
        valid: false,
        error: "Facilitator not listed as signer in registration",
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Registration fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Aggregator Functions (for feedback processing)
// ============================================================================

/**
 * Parameters for validating a feedback submission
 */
export interface ValidateFeedbackParams {
  /**
   * The feedback submission to validate
   */
  submission: FeedbackSubmission;
  /**
   * Function to check if taskRef corresponds to a real settlement
   * Should return settlement data if found
   */
  lookupSettlement: (taskRef: string) => Promise<{
    found: boolean;
    payer?: string;
    payTo?: string;
    amount?: string;
    asset?: string;
  } | null>;
  /**
   * Function to verify client signature
   */
  verifyClientSignature: (
    message: Uint8Array,
    signature: string,
    address: string,
  ) => Promise<boolean>;
  /**
   * Function to check for duplicate submissions
   */
  checkDuplicate?: (taskRef: string) => Promise<boolean>;
  /**
   * Rate limiting configuration
   */
  rateLimitConfig?: RateLimitConfig;
  /**
   * Function to get client feedback count in time window
   */
  getClientFeedbackCount?: (clientAddress: string, sinceTimestamp: number) => Promise<number>;
  /**
   * Minimum payment amount required
   */
  minimumPayment?: { amount: string; asset: string };
}

/**
 * Result of feedback validation
 */
export interface ValidateFeedbackResult {
  valid: boolean;
  error?: string;
  errorCode?:
    | "invalid_task_ref"
    | "invalid_client_signature"
    | "duplicate_feedback"
    | "settlement_mismatch"
    | "attestation_expired"
    | "rate_limited"
    | "payment_below_minimum";
}

/**
 * Validates a feedback submission (for aggregators)
 *
 * @param params - Validation parameters
 * @returns Validation result
 */
export async function validateFeedbackSubmission(
  params: ValidateFeedbackParams,
): Promise<ValidateFeedbackResult> {
  const {
    submission,
    lookupSettlement,
    verifyClientSignature,
    checkDuplicate,
    rateLimitConfig,
    getClientFeedbackCount,
    minimumPayment,
  } = params;

  const now = Math.floor(Date.now() / 1000);

  // 1. Check for duplicates
  if (checkDuplicate) {
    const isDuplicate = await checkDuplicate(submission.taskRef);
    if (isDuplicate) {
      return {
        valid: false,
        error: "Feedback for this taskRef already submitted",
        errorCode: "duplicate_feedback",
      };
    }
  }

  // 2. Validate attestation expiration
  if (submission.facilitatorAttestation) {
    if (submission.facilitatorAttestation.validUntil < now) {
      return {
        valid: false,
        error: "Attestation expired - feedback must be submitted within validity window",
        errorCode: "attestation_expired",
      };
    }
  }

  // 3. Validate taskRef against settlement records
  const settlement = await lookupSettlement(submission.taskRef);
  if (!settlement?.found) {
    return {
      valid: false,
      error: "taskRef not found in aggregator settlement records",
      errorCode: "invalid_task_ref",
    };
  }

  // 4. Check minimum payment
  if (minimumPayment && settlement.amount && settlement.asset) {
    if (settlement.asset === minimumPayment.asset) {
      try {
        const paymentAmount = BigInt(settlement.amount);
        const minimumAmount = BigInt(minimumPayment.amount);
        if (paymentAmount < minimumAmount) {
          return {
            valid: false,
            error: `Payment of ${settlement.amount} below minimum ${minimumPayment.amount}`,
            errorCode: "payment_below_minimum",
          };
        }
      } catch {
        // If BigInt conversion fails, skip this check
      }
    }
  }

  // 5. Check rate limit
  if (rateLimitConfig && getClientFeedbackCount) {
    const windowStart = now - rateLimitConfig.perTimeWindow;
    const recentCount = await getClientFeedbackCount(submission.clientAddress, windowStart);

    if (recentCount >= rateLimitConfig.maxFeedbackPerClient) {
      return {
        valid: false,
        error: `Rate limit exceeded: ${recentCount}/${rateLimitConfig.maxFeedbackPerClient} in last ${rateLimitConfig.perTimeWindow}s`,
        errorCode: "rate_limited",
      };
    }
  }

  // 6. Verify client signature
  // Import the message building function (avoid circular dependency)
  const { buildClientFeedbackMessage, hashClientFeedbackMessage } = await import("./aggregator");
  const message = buildClientFeedbackMessage(
    submission.agentId,
    submission.taskRef,
    submission.value,
    submission.valueDecimals,
  );
  const hash = await hashClientFeedbackMessage(message);

  // Extract address from CAIP-10 format if needed
  const clientAddress = extractAddressFromCaip10(submission.clientAddress);

  const signatureValid = await verifyClientSignature(hash, submission.clientSignature, clientAddress);
  if (!signatureValid) {
    return {
      valid: false,
      error: "Client signature verification failed",
      errorCode: "invalid_client_signature",
    };
  }

  return { valid: true };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if payment payload contains reputation extension
 *
 * @param paymentPayload - The payment payload to check
 * @returns True if the payload contains a reputation extension
 */
export function hasReputationExtension(paymentPayload: PaymentPayload): boolean {
  return !!(paymentPayload.extensions && paymentPayload.extensions[REPUTATION]);
}

/**
 * Gets agent registrations from payment payload
 *
 * @param paymentPayload - The payment payload to extract registrations from
 * @returns Array of agent registrations, or empty array if none found
 */
export function getAgentRegistrations(paymentPayload: PaymentPayload): AgentRegistration[] {
  if (!paymentPayload.extensions) return [];
  const ext = paymentPayload.extensions[REPUTATION] as ReputationRequiredExtension | undefined;
  return ext?.info?.registrations ?? [];
}

/**
 * Gets feedback aggregator endpoint from payment payload
 *
 * @param paymentPayload - The payment payload to extract aggregator from
 * @returns The feedback aggregator endpoint URL, or undefined if not set
 */
export function getFeedbackAggregator(paymentPayload: PaymentPayload): string | undefined {
  if (!paymentPayload.extensions) return undefined;
  const ext = paymentPayload.extensions[REPUTATION] as ReputationRequiredExtension | undefined;
  return ext?.info?.feedbackAggregator?.endpoint;
}

/**
 * Finds the agent registration matching a specific network
 *
 * @param registrations - Array of agent registrations to search
 * @param network - Network identifier to match (e.g., "eip155:8453")
 * @returns The matching registration, or undefined if not found
 */
export function findRegistrationForNetwork(
  registrations: AgentRegistration[],
  network: string,
): AgentRegistration | undefined {
  return registrations.find(reg => {
    const parts = reg.agentRegistry.split(":");
    if (parts.length >= 2) {
      const regNetwork = `${parts[0]}:${parts[1]}`;
      return regNetwork === network;
    }
    return false;
  });
}
