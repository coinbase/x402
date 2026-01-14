/**
 * Validation functions for ERC-20 Approval Gas Sponsoring Extension
 *
 * These functions validate extension data against JSON schemas
 * and perform semantic validation of the extension info.
 */

import Ajv from "ajv/dist/2020.js";
import { ERC20_APPROVAL_GAS_SPONSORING_SCHEMA } from "./schema";
import { CANONICAL_PERMIT2, MIN_SIGNED_TX_HEX_LENGTH } from "./constants";
import type { ERC20ApprovalGasSponsoringInfo } from "./types";

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
 * Validates the structure of ERC-20 approval gas sponsoring info against JSON schema.
 *
 * @param info - The extension info to validate
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = validateERC20ApprovalGasSponsoringSchema(extensionInfo);
 * if (!result.valid) {
 *   console.error("Schema validation failed:", result.errors);
 * }
 * ```
 */
export function validateERC20ApprovalGasSponsoringSchema(info: unknown): ValidationResult {
  try {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(ERC20_APPROVAL_GAS_SPONSORING_SCHEMA);

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
 * Validates the format of a signed transaction hex string.
 *
 * This performs basic format validation:
 * - Must start with "0x"
 * - Must be valid hexadecimal
 * - Must meet minimum length for a valid transaction
 *
 * Note: This does NOT validate the transaction contents (nonce, gas, calldata).
 * Full RLP decoding and semantic validation is done by mechanism-specific code.
 *
 * @param signedTransaction - The RLP-encoded signed transaction hex string
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = validateSignedTransactionFormat(signedTx);
 * if (!result.valid) {
 *   console.error("Invalid transaction format:", result.errors);
 * }
 * ```
 */
export function validateSignedTransactionFormat(signedTransaction: string): ValidationResult {
  const errors: string[] = [];

  // Must start with 0x
  if (!signedTransaction.startsWith("0x")) {
    errors.push("signedTransaction must start with 0x");
    return { valid: false, errors };
  }

  const hexPart = signedTransaction.slice(2);

  // Must be valid hex characters
  if (!/^[a-fA-F0-9]*$/.test(hexPart)) {
    errors.push("signedTransaction contains invalid hex characters");
    return { valid: false, errors };
  }

  // Must meet minimum length (a valid EIP-1559 tx is at least ~50 bytes)
  if (hexPart.length < MIN_SIGNED_TX_HEX_LENGTH) {
    errors.push(
      `signedTransaction too short: expected at least ${MIN_SIGNED_TX_HEX_LENGTH} hex characters, got ${hexPart.length}`,
    );
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validates ERC-20 approval gas sponsoring info for semantic correctness.
 * This performs validation beyond JSON schema including:
 * - Spender is canonical Permit2
 * - Asset matches payment requirements
 * - Signed transaction format is valid
 *
 * Note: Full transaction validation (nonce, gas price, calldata) is done
 * by the mechanism-specific code (e.g., EVM) which can decode the RLP.
 *
 * @param info - The extension info to validate
 * @param expectedAsset - The expected token address from PaymentRequirements
 * @returns Validation result with errors if invalid
 *
 * @example
 * ```typescript
 * const result = validateERC20ApprovalGasSponsoringInfo(extensionInfo, requirements.asset);
 * if (!result.valid) {
 *   console.error("Validation failed:", result.errors);
 * }
 * ```
 */
export function validateERC20ApprovalGasSponsoringInfo(
  info: ERC20ApprovalGasSponsoringInfo,
  expectedAsset: string,
): ValidationResult {
  const errors: string[] = [];

  // Validate schema first
  const schemaResult = validateERC20ApprovalGasSponsoringSchema(info);
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

  // 3. Signed transaction format validation
  const txValidation = validateSignedTransactionFormat(info.signedTransaction);
  if (!txValidation.valid) {
    errors.push(...(txValidation.errors ?? []));
  }

  // 4. Version must be "1"
  if (info.version !== "1") {
    errors.push(`version must be "1", got "${info.version}"`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}
