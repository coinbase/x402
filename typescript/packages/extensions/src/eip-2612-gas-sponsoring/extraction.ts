/**
 * Extraction functions for EIP-2612 Gas Sponsoring Extension
 *
 * These functions help facilitators extract and process extension data
 * from payment payloads during verification and settlement.
 */

import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { EIP2612_GAS_SPONSORING } from "./constants";
import { validateEIP2612GasSponsoringInfo, type ValidationResult } from "./validation";
import type { EIP2612GasSponsoringInfo, EIP2612GasSponsoringPayload } from "./types";

/**
 * Result of extracting EIP-2612 gas sponsoring extension from a payload
 */
export interface ExtractionResult {
  /** Whether the extension was found in the payload */
  found: boolean;
  /** The extracted extension info (if found) */
  info?: EIP2612GasSponsoringInfo;
  /** Validation result (if validate was true) */
  validation?: ValidationResult;
}

/**
 * Extracts EIP-2612 gas sponsoring info from a payment payload.
 *
 * @param payload - The payment payload
 * @param requirements - The payment requirements (for validation context)
 * @param validate - Whether to validate the extracted info (default: true)
 * @returns Extraction result with info if found and validation result
 *
 * @example
 * ```typescript
 * const result = extractEIP2612GasSponsoring(payload, requirements);
 * if (result.found && result.validation?.valid) {
 *   // Use result.info for settlement via x402Permit2Proxy.settleWithPermit()
 * }
 * ```
 */
export function extractEIP2612GasSponsoring(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
  validate: boolean = true,
): ExtractionResult {
  // Check if extension exists in payload
  const extension = payload.extensions?.[EIP2612_GAS_SPONSORING] as
    | EIP2612GasSponsoringPayload
    | undefined;

  if (!extension?.info) {
    return { found: false };
  }

  const info = extension.info;

  if (!validate) {
    return { found: true, info };
  }

  // Validate the extension data
  const validation = validateEIP2612GasSponsoringInfo(info, requirements.asset);

  return {
    found: true,
    info,
    validation,
  };
}

/**
 * Checks if the payment payload contains EIP-2612 gas sponsoring extension.
 *
 * @param payload - The payment payload to check
 * @returns true if the extension is present
 *
 * @example
 * ```typescript
 * if (hasEIP2612GasSponsoring(payload)) {
 *   // Handle EIP-2612 settlement path via x402Permit2Proxy.settleWithPermit()
 * } else {
 *   // Handle standard settlement path via x402Permit2Proxy.settle()
 * }
 * ```
 */
export function hasEIP2612GasSponsoring(payload: PaymentPayload): boolean {
  return EIP2612_GAS_SPONSORING in (payload.extensions ?? {});
}

/**
 * Extracts and validates EIP-2612 gas sponsoring in one step.
 * Returns the info only if found and valid.
 *
 * @param payload - The payment payload
 * @param requirements - The payment requirements
 * @returns The extension info if valid, null otherwise
 *
 * @example
 * ```typescript
 * const info = extractValidEIP2612GasSponsoring(payload, requirements);
 * if (info) {
 *   // Safe to use for settlement
 *   await x402Permit2Proxy.settleWithPermit(info, ...);
 * }
 * ```
 */
export function extractValidEIP2612GasSponsoring(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): EIP2612GasSponsoringInfo | null {
  const result = extractEIP2612GasSponsoring(payload, requirements, true);

  if (result.found && result.validation?.valid && result.info) {
    return result.info;
  }

  return null;
}
