/**
 * Facilitator functions for validating and extracting Bazaar discovery extensions
 * 
 * These functions help facilitators validate extension data against schemas
 * and extract the discovery information for cataloging in the Bazaar.
 * 
 * Supports both v2 (extensions in PaymentRequired) and v1 (outputSchema in PaymentRequirements).
 */

import Ajv from "ajv/dist/2020";
import type { PaymentPayload, PaymentRequirements, PaymentRequirementsV1 } from "@x402/core/types";
import type { DiscoveryExtension, DiscoveryInfo } from "./types";
import { BAZAAR } from "./types";
import { extractDiscoveryInfoV1 } from "./v1/facilitator";

/**
 * Validation result for discovery extensions
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validates a discovery extension's info against its schema
 * 
 * @param extension - The discovery extension containing info and schema
 * @returns Validation result indicating if the info matches the schema
 * 
 * @example
 * ```typescript
 * const extension = declareDiscoveryExtension(...);
 * const result = validateDiscoveryExtension(extension);
 * 
 * if (result.valid) {
 *   console.log("Extension is valid");
 * } else {
 *   console.error("Validation errors:", result.errors);
 * }
 * ```
 */
export function validateDiscoveryExtension(
  extension: DiscoveryExtension
): ValidationResult {
  try {
    const ajv = new Ajv({ strict: false, allErrors: true });
    const validate = ajv.compile(extension.schema);

    // The schema describes the structure of info directly
    // Schema has properties: { input: {...}, output: {...} }
    // So we validate extension.info which has { input: {...}, output: {...} }
    const valid = validate(extension.info);

    if (valid) {
      return { valid: true };
    }

    const errors = validate.errors?.map((err) => {
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

/**
 * Extracts the discovery info from payment payload and requirements
 * 
 * This function handles both v2 (extensions) and v1 (outputSchema) formats.
 * 
 * For v2: Discovery info is in PaymentPayload.extensions (client copied it from PaymentRequired)
 * For v1: Discovery info is in PaymentRequirements.outputSchema
 * 
 * V1 data is automatically transformed to v2 DiscoveryInfo format, making smart
 * assumptions about field names (queryParams/query/params for GET, bodyFields/body/data for POST, etc.)
 * 
 * @param paymentPayload - The payment payload containing extensions (v2) and version info
 * @param paymentRequirements - The payment requirements (contains outputSchema for v1)
 * @param validate - Whether to validate v2 extensions before extracting (default: true)
 * @returns The discovery info in v2 format if present, or null if not discoverable
 * 
 * @example
 * ```typescript
 * // V2 - extensions are in PaymentPayload
 * const info = extractDiscoveryInfo(paymentPayload, paymentRequirements);
 * 
 * // V1 - discovery info is in PaymentRequirements.outputSchema
 * const info = extractDiscoveryInfo(paymentPayloadV1, paymentRequirementsV1);
 * 
 * if (info) {
 *   // Both v1 and v2 return the same DiscoveryInfo structure
 *   console.log("Method:", info.input.method);
 * }
 * ```
 */
export function extractDiscoveryInfo(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements | PaymentRequirementsV1,
  validate: boolean = true
): DiscoveryInfo | null {
  // Try v2 first - extensions are in PaymentPayload (client copied from PaymentRequired)
  if (paymentPayload.x402Version === 2 && paymentPayload.extensions) {
    const bazaarExtension = paymentPayload.extensions[BAZAAR];

    if (bazaarExtension && typeof bazaarExtension === "object") {
      try {
        const extension = bazaarExtension as DiscoveryExtension;

        if (validate) {
          const result = validateDiscoveryExtension(extension);
          if (!result.valid) {
            // V2 validation failed, fall through to try v1
            console.warn(
              `V2 discovery extension validation failed: ${result.errors?.join(", ")}`
            );
          } else {
            return extension.info;
          }
        } else {
          return extension.info;
        }
      } catch (error) {
        // V2 extraction failed, fall through to try v1
        console.warn(`V2 discovery extension extraction failed: ${error}`);
      }
    }
  }

  // Try v1 format - discovery info is in PaymentRequirements.outputSchema
  if (paymentPayload.x402Version === 1) {
    // Cast to v1 format and try to extract
    const requirementsV1 = paymentRequirements as PaymentRequirementsV1;
    const infoV1 = extractDiscoveryInfoV1(requirementsV1);

    if (infoV1) {
      return infoV1;
    }
  }

  // No discovery info found
  return null;
}

/**
 * Extracts discovery info from a v2 extension directly
 * 
 * This is a lower-level function for when you already have the extension object.
 * For general use, prefer the main extractDiscoveryInfo function.
 * 
 * @param extension - The discovery extension to extract info from
 * @param validate - Whether to validate before extracting (default: true)
 * @returns The discovery info if valid
 * @throws Error if validation fails and validate is true
 */
export function extractDiscoveryInfoFromExtension(
  extension: DiscoveryExtension,
  validate: boolean = true
): DiscoveryInfo {
  if (validate) {
    const result = validateDiscoveryExtension(extension);
    if (!result.valid) {
      throw new Error(
        `Invalid discovery extension: ${result.errors?.join(", ") || "Unknown error"}`
      );
    }
  }

  return extension.info;
}

/**
 * Validates and extracts discovery info in one step
 * 
 * This is a convenience function that combines validation and extraction,
 * returning both the validation result and the info if valid.
 * 
 * @param extension - The discovery extension to validate and extract
 * @returns Object containing validation result and info (if valid)
 * 
 * @example
 * ```typescript
 * const extension = declareDiscoveryExtension(...);
 * const { valid, info, errors } = validateAndExtract(extension);
 * 
 * if (valid && info) {
 *   // Store info in Bazaar catalog
 * } else {
 *   console.error("Validation errors:", errors);
 * }
 * ```
 */
export function validateAndExtract(extension: DiscoveryExtension): {
  valid: boolean;
  info?: DiscoveryInfo;
  errors?: string[];
} {
  const result = validateDiscoveryExtension(extension);

  if (result.valid) {
    return {
      valid: true,
      info: extension.info,
    };
  }

  return {
    valid: false,
    errors: result.errors,
  };
}

