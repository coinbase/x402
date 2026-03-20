/**
 * Facilitator functions for validating and extracting Bazaar discovery extensions
 *
 * These functions help facilitators validate extension data against schemas
 * and extract the discovery information for cataloging in the Bazaar.
 *
 * Supports both v2 (extensions in PaymentRequired) and v1 (outputSchema in PaymentRequirements).
 */

import Ajv from "ajv/dist/2020.js";
import type { PaymentPayload, PaymentRequirements, PaymentRequirementsV1 } from "@x402/core/types";
import type { DiscoveryExtension, DiscoveryInfo } from "./types";
import type { McpDiscoveryInfo } from "./mcp/types";
import type { DiscoveredHTTPResource } from "./http/types";
import type { DiscoveredMCPResource } from "./mcp/types";
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
export function validateDiscoveryExtension(extension: DiscoveryExtension): ValidationResult {
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

const VALID_QUERY_METHODS = new Set(["GET", "HEAD", "DELETE"]);
const VALID_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const VALID_METHODS = new Set([...VALID_QUERY_METHODS, ...VALID_BODY_METHODS]);
const VALID_BODY_TYPES = new Set(["json", "form-data", "text"]);
const VALID_MCP_TRANSPORTS = new Set(["streamable-http", "sse"]);

/**
 * Validates a discovery extension against the Bazaar protocol specification.
 *
 * Unlike `validateDiscoveryExtension` which checks internal consistency (info vs schema),
 * this function enforces protocol-level invariants:
 *   - `info.input.type` must be "http" or "mcp"
 *   - HTTP: if `method` is present it must be GET/POST/PUT/PATCH/DELETE/HEAD
 *   - HTTP body methods: `bodyType` must be "json" | "form-data" | "text"
 *   - MCP: `toolName` (string) and `inputSchema` (object) are required
 *   - MCP: if `transport` is present it must be "streamable-http" | "sse"
 *
 * Designed to be safe for pre-enrichment HTTP extensions where `method` may be absent.
 *
 * @param extension - The discovery extension to validate
 * @returns Validation result with spec-level errors
 */
export function validateDiscoveryExtensionSpec(
  extension: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  const info = extension.info;
  if (!info || typeof info !== "object") {
    return { valid: false, errors: ["Missing or invalid 'info' field"] };
  }

  const input = (info as Record<string, unknown>).input;
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Missing or invalid 'info.input' field"] };
  }

  const inputObj = input as Record<string, unknown>;
  const inputType = inputObj.type;

  if (inputType !== "http" && inputType !== "mcp") {
    errors.push(`info.input.type must be "http" or "mcp", got "${String(inputType)}"`);
    return { valid: false, errors };
  }

  if (inputType === "http") {
    const method = inputObj.method;
    if (method !== undefined && !VALID_METHODS.has(method as string)) {
      errors.push(
        `info.input.method must be one of ${[...VALID_METHODS].join(", ")}, got "${String(method)}"`,
      );
    }

    const bodyType = inputObj.bodyType;
    if (bodyType !== undefined) {
      if (!VALID_BODY_TYPES.has(bodyType as string)) {
        errors.push(
          `info.input.bodyType must be one of ${[...VALID_BODY_TYPES].join(", ")}, got "${String(bodyType)}"`,
        );
      }
      if (method !== undefined && !VALID_BODY_METHODS.has(method as string)) {
        errors.push(
          `info.input.bodyType is set but method "${String(method)}" is not a body method (POST, PUT, PATCH)`,
        );
      }
    }
  }

  if (inputType === "mcp") {
    if (typeof inputObj.toolName !== "string" || inputObj.toolName.length === 0) {
      errors.push("info.input.toolName is required and must be a non-empty string for MCP extensions");
    }
    if (!inputObj.inputSchema || typeof inputObj.inputSchema !== "object") {
      errors.push("info.input.inputSchema is required and must be an object for MCP extensions");
    }
    const transport = inputObj.transport;
    if (transport !== undefined && !VALID_MCP_TRANSPORTS.has(transport as string)) {
      errors.push(
        `info.input.transport must be one of ${[...VALID_MCP_TRANSPORTS].join(", ")}, got "${String(transport)}"`,
      );
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
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
export type { DiscoveredHTTPResource } from "./http/types";
export type { DiscoveredMCPResource } from "./mcp/types";

export type DiscoveredResource = DiscoveredHTTPResource | DiscoveredMCPResource;

/**
 * Extracts discovery information from payment payload and requirements.
 * Combines resource URL, HTTP method, version, and discovery info into a single object.
 *
 * @param paymentPayload - The payment payload containing extensions and resource info
 * @param paymentRequirements - The payment requirements to validate against
 * @param validate - Whether to validate the discovery info against the schema (default: true)
 * @returns Discovered resource info with URL, method, version and discovery data, or null if not found
 */
export function extractDiscoveryInfo(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements | PaymentRequirementsV1,
  validate: boolean = true,
): DiscoveredResource | null {
  let discoveryInfo: DiscoveryInfo | null = null;
  let resourceUrl: string;

  if (paymentPayload.x402Version === 2) {
    resourceUrl = paymentPayload.resource?.url ?? "";

    if (paymentPayload.extensions) {
      const bazaarExtension = paymentPayload.extensions[BAZAAR.key];

      if (bazaarExtension && typeof bazaarExtension === "object") {
        try {
          const extension = bazaarExtension as DiscoveryExtension;

          if (validate) {
            const result = validateDiscoveryExtension(extension);
            if (!result.valid) {
              console.warn(
                `V2 discovery extension validation failed: ${result.errors?.join(", ")}`,
              );
            } else {
              discoveryInfo = extension.info;
            }
          } else {
            discoveryInfo = extension.info;
          }
        } catch (error) {
          console.warn(`V2 discovery extension extraction failed: ${error}`);
        }
      }
    }
  } else if (paymentPayload.x402Version === 1) {
    const requirementsV1 = paymentRequirements as PaymentRequirementsV1;
    resourceUrl = requirementsV1.resource;
    discoveryInfo = extractDiscoveryInfoV1(requirementsV1);
  } else {
    return null;
  }

  if (!discoveryInfo) {
    return null;
  }

  // Strip query params (?) and hash sections (#) for discovery cataloging
  const url = new URL(resourceUrl);
  const normalizedResourceUrl = `${url.origin}${url.pathname}`;

  // Extract description and mimeType from resource info (v2) or requirements (v1)
  let description: string | undefined;
  let mimeType: string | undefined;

  if (paymentPayload.x402Version === 2) {
    description = paymentPayload.resource?.description;
    mimeType = paymentPayload.resource?.mimeType;
  } else if (paymentPayload.x402Version === 1) {
    const requirementsV1 = paymentRequirements as PaymentRequirementsV1;
    description = requirementsV1.description;
    mimeType = requirementsV1.mimeType;
  }

  const base = {
    resourceUrl: normalizedResourceUrl,
    description,
    mimeType,
    x402Version: paymentPayload.x402Version,
    discoveryInfo,
  };

  if (discoveryInfo.input.type === "mcp") {
    return { ...base, toolName: (discoveryInfo as McpDiscoveryInfo).input.toolName };
  }

  return { ...base, method: discoveryInfo.input.method };
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
  validate: boolean = true,
): DiscoveryInfo {
  if (validate) {
    const result = validateDiscoveryExtension(extension);
    if (!result.valid) {
      throw new Error(
        `Invalid discovery extension: ${result.errors?.join(", ") || "Unknown error"}`,
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
