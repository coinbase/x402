/**
 * Facilitator-side Reputation Extension Utilities
 *
 * Functions for facilitators to:
 * - Validate reputation extension data
 * - Extract agent identity information
 * - Process feedback submissions (for aggregators)
 */

import Ajv from "ajv/dist/2020.js";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type {
  ReputationInfo,
  ReputationRequiredExtension,
  FeedbackSubmission,
  AgentRegistration,
} from "./types";
import { REPUTATION } from "./types";
import { buildClientFeedbackMessage, hashClientFeedbackMessage } from "./aggregator";

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
      validate.errors?.map((err) => {
        const path = err.instancePath || "(root)";
        return `${path}: ${err.message}`;
      }) || ["Unknown validation error"];

    return { valid: false, errors };
  } catch (error) {
    return {
      valid: false,
      errors: [`Schema validation failed: ${error instanceof Error ? error.message : String(error)}`],
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
    const matchingRegistration = agentInfo.registrations.find((reg) => {
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
  lookupSettlement: (
    taskRef: string,
  ) => Promise<{
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
    | "settlement_mismatch";
}

/**
 * Validates a feedback submission (for aggregators)
 *
 * @param params - Validation parameters
 * @returns Validation result
 *
 * @example
 * ```typescript
 * // In aggregator endpoint
 * const result = await validateFeedbackSubmission({
 *   submission: req.body,
 *   lookupSettlement: async (taskRef) => {
 *     return db.settlements.findOne({ taskRef });
 *   },
 *   verifyClientSignature: async (msg, sig, addr) => {
 *     return verifySignature(msg, sig, addr);
 *   },
 *   checkDuplicate: async (taskRef) => {
 *     return db.feedback.exists({ taskRef });
 *   }
 * });
 *
 * if (!result.valid) {
 *   return res.status(400).json({ error: result.errorCode, message: result.error });
 * }
 * ```
 */
export async function validateFeedbackSubmission(
  params: ValidateFeedbackParams,
): Promise<ValidateFeedbackResult> {
  const { submission, lookupSettlement, verifyClientSignature, checkDuplicate } = params;

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

  // 2. Validate taskRef against settlement records
  const settlement = await lookupSettlement(submission.taskRef);
  if (!settlement?.found) {
    return {
      valid: false,
      error: "taskRef not found in aggregator settlement records",
      errorCode: "invalid_task_ref",
    };
  }

  // 3. Verify client signature
  const message = buildClientFeedbackMessage(
    submission.agentId,
    submission.taskRef,
    submission.value,
    submission.valueDecimals,
  );
  const hash = await hashClientFeedbackMessage(message);

  // Extract address from CAIP-10 format if needed
  const clientAddress = submission.clientAddress.includes(":")
    ? submission.clientAddress.split(":").pop() ?? submission.clientAddress
    : submission.clientAddress;

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
 */
export function hasReputationExtension(paymentPayload: PaymentPayload): boolean {
  return !!(paymentPayload.extensions && paymentPayload.extensions[REPUTATION]);
}

/**
 * Gets agent registrations from payment payload
 */
export function getAgentRegistrations(paymentPayload: PaymentPayload): AgentRegistration[] {
  if (!paymentPayload.extensions) return [];

  const ext = paymentPayload.extensions[REPUTATION] as ReputationRequiredExtension | undefined;
  return ext?.info?.registrations ?? [];
}

/**
 * Gets feedback aggregator endpoint from payment payload
 */
export function getFeedbackAggregator(paymentPayload: PaymentPayload): string | undefined {
  if (!paymentPayload.extensions) return undefined;

  const ext = paymentPayload.extensions[REPUTATION] as ReputationRequiredExtension | undefined;
  return ext?.info?.feedbackAggregator?.endpoint;
}

/**
 * Finds the agent registration matching a specific network
 */
export function findRegistrationForNetwork(
  registrations: AgentRegistration[],
  network: string,
): AgentRegistration | undefined {
  return registrations.find((reg) => {
    const parts = reg.agentRegistry.split(":");
    if (parts.length >= 2) {
      const regNetwork = `${parts[0]}:${parts[1]}`;
      return regNetwork === network;
    }
    return false;
  });
}

/**
 * Extracts network from CAIP-10 address
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

/**
 * Extracts address from CAIP-10 format
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
