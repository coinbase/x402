/**
 * Validation functions for EIP-2612 Gas Sponsoring Extension
 *
 * These functions validate extension data against JSON schemas
 * and perform semantic validation of the extension info.
 */

import type { PaymentRequirements } from "@x402/core/types";
import Ajv from "ajv/dist/2020.js";
import { EIP2612_GAS_SPONSORING_SCHEMA } from "./schema";
import { CANONICAL_PERMIT2, MIN_DEADLINE_BUFFER_SECONDS } from "./constants";
import type { EIP2612GasSponsoringInfo } from "./types";

/**
 * Result of extension validation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error messages if validation failed */
  errors?: string[];
}

/**
 * Validates the structure of EIP-2612 gas sponsoring info against JSON schema.
 *
 * @param info - The extension info to validate
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = validateEIP2612GasSponsoringSchema(extensionInfo);
 * if (!result.valid) {
 *   console.error("Schema validation failed:", result.errors);
 * }
 * ```
 */
export function validateEIP2612GasSponsoringSchema(info: unknown): ValidationResult {
  try {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(EIP2612_GAS_SPONSORING_SCHEMA);

    const valid = validate(info);

    if (valid) {
      return { valid: true };
    }

    const errors = validate.errors?.map(err => {
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

/**
 * Validates EIP-2612 gas sponsoring info for semantic correctness.
 * This performs validation beyond JSON schema including:
 * - Spender is canonical Permit2
 * - Asset matches payment requirements
 * - Deadline is in the future
 * - Signature format is correct
 *
 * @param info - The extension info to validate
 * @param expectedAsset - The expected token address from PaymentRequirements
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = validateEIP2612GasSponsoringInfo(extensionInfo, requirements.asset);
 * if (!result.valid) {
 *   console.error("Validation failed:", result.errors);
 * }
 * ```
 */
export function validateEIP2612GasSponsoringInfo(
  info: EIP2612GasSponsoringInfo,
  expectedAsset: string,
): ValidationResult {
  const errors: string[] = [];

  // Validate schema first
  const schemaResult = validateEIP2612GasSponsoringSchema(info);
  if (!schemaResult.valid) {
    return schemaResult;
  }

  // Semantic validations

  // 1. Spender must be canonical Permit2
  if (info.spender.toLowerCase() !== CANONICAL_PERMIT2.toLowerCase()) {
    errors.push(`spender must be canonical Permit2 (${CANONICAL_PERMIT2}), got ${info.spender}`);
  }

  // 2. Asset must match payment requirements
  if (info.asset.toLowerCase() !== expectedAsset.toLowerCase()) {
    errors.push(`asset mismatch: expected ${expectedAsset}, got ${info.asset}`);
  }

  // 3. Deadline must be in the future with buffer
  const now = Math.floor(Date.now() / 1000);
  const deadline = parseInt(info.deadline, 10);
  if (isNaN(deadline)) {
    errors.push("deadline must be a valid integer timestamp");
  } else if (deadline < now + MIN_DEADLINE_BUFFER_SECONDS) {
    errors.push(
      `deadline too soon: must be at least ${MIN_DEADLINE_BUFFER_SECONDS}s in the future`,
    );
  }

  // 4. Nonce must be a valid non-negative integer
  const nonce = parseInt(info.nonce, 10);
  if (isNaN(nonce) || nonce < 0) {
    errors.push("nonce must be a non-negative integer");
  }

  // 5. Signature format check (65 bytes = 130 hex chars + 0x prefix)
  const sigHex = info.signature.startsWith("0x") ? info.signature.slice(2) : info.signature;
  if (sigHex.length !== 130) {
    errors.push(`signature must be exactly 65 bytes (130 hex characters), got ${sigHex.length}`);
  }

  // 6. Version must be "1"
  if (info.version !== "1") {
    errors.push(`version must be "1", got "${info.version}"`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validates that PaymentRequirements contains the EIP-712 domain info
 * required for EIP-2612 gas sponsoring.
 *
 * EIP-2612 requires the token's EIP-712 domain name and version to construct
 * the permit signature. These must be provided in `requirements.extra`.
 *
 * @param requirements - The payment requirements to validate
 * @returns Validation result with errors if domain info is missing
 *
 * @example
 * ```typescript
 * const result = validateEIP2612DomainRequirements(requirements);
 * if (!result.valid) {
 *   // Cannot use EIP-2612 - missing domain info
 *   console.error(result.errors);
 * }
 * ```
 */
export function validateEIP2612DomainRequirements(
  requirements: PaymentRequirements,
): ValidationResult {
  const errors: string[] = [];

  if (!requirements.extra?.name) {
    errors.push("requirements.extra.name is required for EIP-2612 (token EIP-712 domain name)");
  }

  if (!requirements.extra?.version) {
    errors.push(
      "requirements.extra.version is required for EIP-2612 (token EIP-712 domain version)",
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
