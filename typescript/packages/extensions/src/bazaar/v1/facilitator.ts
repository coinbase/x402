/**
 * V1 Facilitator functions for extracting Bazaar discovery information
 * 
 * In v1, discovery information is stored in the `outputSchema` field
 * of PaymentRequirements, which has a different structure than v2.
 * 
 * This module transforms v1 data into v2 DiscoveryInfo format.
 */

import type { PaymentRequirementsV1 } from "@x402/core/types";
import type { BodyMethods, QueryParamMethods } from "@x402/core/http";
import type { DiscoveryInfo, QueryDiscoveryInfo, BodyDiscoveryInfo } from "../types";

/**
 * Type guard to check if an object has the v1 outputSchema structure
 */
function hasV1OutputSchema(obj: any): obj is { input: any; output?: any } {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "input" in obj &&
    typeof obj.input === "object" &&
    "type" in obj.input &&
    obj.input.type === "http" &&
    "method" in obj.input
  );
}

/**
 * Checks if a method is a query parameter method
 */
function isQueryMethod(method: string): method is QueryParamMethods {
  const upperMethod = method.toUpperCase();
  return upperMethod === "GET" || upperMethod === "HEAD" || upperMethod === "DELETE";
}

/**
 * Checks if a method is a body method
 */
function isBodyMethod(method: string): method is BodyMethods {
  const upperMethod = method.toUpperCase();
  return upperMethod === "POST" || upperMethod === "PUT" || upperMethod === "PATCH";
}

/**
 * Extracts query parameters from v1 input, making smart assumptions
 * about common field names used in v1
 */
function extractQueryParams(v1Input: any): Record<string, any> | undefined {
  // Check various common field names used in v1 (both camelCase and snake_case)
  if (v1Input.queryParams) {
    return v1Input.queryParams;
  }
  if (v1Input.query_params) {
    return v1Input.query_params;
  }
  if (v1Input.query) {
    return v1Input.query;
  }
  if (v1Input.params) {
    return v1Input.params;
  }
  return undefined;
}

/**
 * Extracts body information from v1 input, making smart assumptions
 */
function extractBodyInfo(v1Input: any): { body: any; bodyType: "json" | "form-data" | "text" } {
  // Determine body type (check both camelCase and snake_case)
  let bodyType: "json" | "form-data" | "text" = "json";
  const bodyTypeField = v1Input.bodyType || v1Input.body_type;

  if (bodyTypeField) {
    const type = bodyTypeField.toLowerCase();
    if (type.includes("form") || type.includes("multipart")) {
      bodyType = "form-data";
    } else if (type.includes("text") || type.includes("plain")) {
      bodyType = "text";
    } else {
      bodyType = "json";
    }
  }

  // Extract body content from various possible fields
  // Priority order based on observed patterns in real data
  let body: any = {};

  if (v1Input.bodyFields) {
    body = v1Input.bodyFields;
  } else if (v1Input.body_fields && v1Input.body_fields !== null) {
    body = v1Input.body_fields;
  } else if (v1Input.bodyParams) {
    body = v1Input.bodyParams;
  } else if (v1Input.body) {
    body = v1Input.body;
  } else if (v1Input.data) {
    body = v1Input.data;
  } else if (v1Input.properties) {
    // Some endpoints have properties directly at the input level
    body = v1Input.properties;
  }

  return { body, bodyType };
}

/**
 * Extracts discovery info from v1 PaymentRequirements and transforms to v2 format
 * 
 * In v1, the discovery information is stored in the `outputSchema` field,
 * which contains both input (endpoint shape) and output (response schema) information.
 * 
 * This function makes smart assumptions to normalize v1 data into v2 DiscoveryInfo format:
 * - For GET/HEAD/DELETE: Looks for queryParams, query, or params fields
 * - For POST/PUT/PATCH: Looks for bodyFields, body, or data fields and normalizes bodyType
 * - Extracts optional headers if present
 * 
 * @param paymentRequirements - V1 payment requirements
 * @returns Discovery info in v2 format if present and valid, or null if not discoverable
 * 
 * @example
 * ```typescript
 * const requirements: PaymentRequirementsV1 = {
 *   scheme: "exact",
 *   network: "eip155:8453",
 *   maxAmountRequired: "100000",
 *   resource: "https://api.example.com/data",
 *   description: "Get data",
 *   mimeType: "application/json",
 *   outputSchema: {
 *     input: {
 *       type: "http",
 *       method: "GET",
 *       discoverable: true,
 *       queryParams: { query: "string" }
 *     },
 *     output: { type: "object" }
 *   },
 *   payTo: "0x...",
 *   maxTimeoutSeconds: 300,
 *   asset: "0x...",
 *   extra: {}
 * };
 * 
 * const info = extractDiscoveryInfoV1(requirements);
 * if (info) {
 *   console.log("Endpoint method:", info.input.method);
 * }
 * ```
 */
export function extractDiscoveryInfoV1(
  paymentRequirements: PaymentRequirementsV1
): DiscoveryInfo | null {
  const { outputSchema } = paymentRequirements;

  // Check if outputSchema exists and has the expected structure
  if (!outputSchema || !hasV1OutputSchema(outputSchema)) {
    return null;
  }

  const v1Input = outputSchema.input;

  // Check if the endpoint is marked as discoverable
  // Default to true if not specified (for backwards compatibility)
  const isDiscoverable = v1Input.discoverable ?? true;

  if (!isDiscoverable) {
    return null;
  }

  const method = v1Input.method.toUpperCase();

  // Extract headers if present (check both camelCase and snake_case)
  const headers = v1Input.headerFields || v1Input.header_fields || v1Input.headers;

  // Extract output example/schema if present
  const output = outputSchema.output
    ? {
      type: "json" as const,
      example: outputSchema.output,
    }
    : undefined;

  // Transform based on method type
  if (isQueryMethod(method)) {
    // Query parameter method (GET, HEAD, DELETE)
    const queryParams = extractQueryParams(v1Input);

    const discoveryInfo: QueryDiscoveryInfo = {
      input: {
        type: "http",
        method: method as QueryParamMethods,
        ...(queryParams && { queryParams }),
        ...(headers && { headers }),
      },
      ...(output && { output }),
    };

    return discoveryInfo;
  } else if (isBodyMethod(method)) {
    // Body method (POST, PUT, PATCH)
    const { body, bodyType } = extractBodyInfo(v1Input);
    const queryParams = extractQueryParams(v1Input); // Some POST requests also have query params

    const discoveryInfo: BodyDiscoveryInfo = {
      input: {
        type: "http",
        method: method as BodyMethods,
        bodyType,
        body,
        ...(queryParams && { queryParams }),
        ...(headers && { headers }),
      },
      ...(output && { output }),
    };

    return discoveryInfo;
  }

  // Unsupported method, return null
  return null;
}

/**
 * Checks if v1 PaymentRequirements contains discoverable information
 * 
 * @param paymentRequirements - V1 payment requirements
 * @returns True if the requirements contain valid discovery info
 * 
 * @example
 * ```typescript
 * if (isDiscoverableV1(requirements)) {
 *   const info = extractDiscoveryInfoV1(requirements);
 *   // Catalog info in Bazaar
 * }
 * ```
 */
export function isDiscoverableV1(
  paymentRequirements: PaymentRequirementsV1
): boolean {
  return extractDiscoveryInfoV1(paymentRequirements) !== null;
}

/**
 * Extracts resource metadata from v1 PaymentRequirements
 * 
 * In v1, resource information is embedded directly in the payment requirements
 * rather than in a separate resource object.
 * 
 * @param paymentRequirements - V1 payment requirements
 * @returns Resource metadata
 * 
 * @example
 * ```typescript
 * const metadata = extractResourceMetadataV1(requirements);
 * console.log("Resource URL:", metadata.url);
 * console.log("Description:", metadata.description);
 * ```
 */
export function extractResourceMetadataV1(
  paymentRequirements: PaymentRequirementsV1
): {
  url: string;
  description: string;
  mimeType: string;
} {
  return {
    url: paymentRequirements.resource,
    description: paymentRequirements.description,
    mimeType: paymentRequirements.mimeType,
  };
}

