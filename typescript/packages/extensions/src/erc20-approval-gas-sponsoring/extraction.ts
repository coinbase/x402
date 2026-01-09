/**
 * Extraction functions for ERC-20 Approval Gas Sponsoring Extension
 *
 * These functions help facilitators extract and process extension data
 * from payment payloads during verification and settlement.
 */

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { ERC20_APPROVAL_GAS_SPONSORING } from "./constants";
import { validateERC20ApprovalGasSponsoringInfo, type ValidationResult } from "./validation";
import type { ERC20ApprovalGasSponsoringInfo, ERC20ApprovalGasSponsoringPayload } from "./types";

/**
 * Result of extracting ERC-20 approval gas sponsoring extension from a payload
 */
export interface ExtractionResult {
  /** Whether the extension was found in the payload */
  found: boolean;
  /** The extracted extension info (if found) */
  info?: ERC20ApprovalGasSponsoringInfo;
  /** Validation result (if validate was true) */
  validation?: ValidationResult;
}

/**
 * Extracts ERC-20 approval gas sponsoring info from a payment payload.
 *
 * @param payload - The payment payload
 * @param requirements - The payment requirements (for validation context)
 * @param validate - Whether to validate the extracted info (default: true)
 * @returns Extraction result with info if found and validation result
 *
 * @example
 * ```typescript
 * const result = extractERC20ApprovalGasSponsoring(payload, requirements);
 * if (result.found && result.validation?.valid) {
 *   // Use result.info for atomic batch settlement
 * }
 * ```
 */
export function extractERC20ApprovalGasSponsoring(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  validate: boolean = true,
): ExtractionResult {
  // Check if extension exists in payload
  const extension = payload.extensions?.[ERC20_APPROVAL_GAS_SPONSORING] as
    | ERC20ApprovalGasSponsoringPayload
    | undefined;

  if (!extension?.info) {
    return { found: false };
  }

  const info = extension.info;

  if (!validate) {
    return { found: true, info };
  }

  // Validate the extension data
  const validation = validateERC20ApprovalGasSponsoringInfo(info, requirements.asset);

  return {
    found: true,
    info,
    validation,
  };
}

/**
 * Checks if the payment payload contains ERC-20 approval gas sponsoring extension.
 *
 * @param payload - The payment payload to check
 * @returns true if the extension is present
 *
 * @example
 * ```typescript
 * if (hasERC20ApprovalGasSponsoring(payload)) {
 *   // Handle ERC-20 approval settlement path with atomic batch
 * } else {
 *   // Handle standard settlement path
 * }
 * ```
 */
export function hasERC20ApprovalGasSponsoring(payload: PaymentPayload): boolean {
  return ERC20_APPROVAL_GAS_SPONSORING in (payload.extensions ?? {});
}

/**
 * Extracts and validates ERC-20 approval gas sponsoring in one step.
 * Returns the info only if found and valid.
 *
 * @param payload - The payment payload
 * @param requirements - The payment requirements
 * @returns The extension info if valid, null otherwise
 *
 * @example
 * ```typescript
 * const info = extractValidERC20ApprovalGasSponsoring(payload, requirements);
 * if (info) {
 *   // Safe to use for atomic batch settlement
 *   await executeAtomicBatch(info.signedTransaction, ...);
 * }
 * ```
 */
export function extractValidERC20ApprovalGasSponsoring(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): ERC20ApprovalGasSponsoringInfo | null {
  const result = extractERC20ApprovalGasSponsoring(payload, requirements, true);

  if (result.found && result.validation?.valid && result.info) {
    return result.info;
  }

  return null;
}
