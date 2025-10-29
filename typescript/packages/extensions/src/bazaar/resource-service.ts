/**
 * Resource Service functions for creating Bazaar discovery extensions
 * 
 * These functions help servers declare the shape of their endpoints
 * for facilitator discovery and cataloging in the Bazaar.
 */

import type { BodyMethods, QueryParamMethods } from "@x402/core/http";
import {
  type DiscoveryExtension,
  type QueryDiscoveryExtension,
  type BodyDiscoveryExtension,
  type DeclareDiscoveryExtensionConfig,
  type DeclareQueryDiscoveryExtensionConfig,
  type DeclareBodyDiscoveryExtensionConfig,
  isQueryExtensionConfig,
  isBodyExtensionConfig,
} from "./types";

/**
 * Internal helper to create a query discovery extension
 */
function createQueryDiscoveryExtension({
  method,
  input = {},
  inputSchema = { properties: {} },
  output,
}: DeclareQueryDiscoveryExtensionConfig): QueryDiscoveryExtension {
  return {
    info: {
      input: {
        type: "http",
        method,
        ...(input && { queryParams: input }),
      },
      ...(output?.example && {
        output: {
          type: "json",
          example: output.example,
        },
      }),
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        input: {
          type: "object",
          properties: {
            type: {
              type: "string",
              const: "http",
            },
            method: {
              type: "string",
              enum: [method] as QueryParamMethods[],
            },
            ...(inputSchema && {
              queryParams: {
                type: "object" as const,
                ...inputSchema,
              },
            }),
          },
          required: ["type", "method"],
          additionalProperties: false,
        },
        ...(output?.example && {
          output: {
            type: "object" as const,
            properties: {
              type: {
                type: "string" as const,
              },
              example: {
                type: "object" as const,
                ...(output.schema || {}),
              },
            },
            required: ["type"] as const,
          },
        }),
      },
      required: ["input"],
    },
  };
}

/**
 * Internal helper to create a body discovery extension
 */
function createBodyDiscoveryExtension({
  method,
  input = {},
  inputSchema = { properties: {} },
  bodyType = "json",
  output,
}: DeclareBodyDiscoveryExtensionConfig): BodyDiscoveryExtension {

  return {
    info: {
      input: {
        type: "http",
        method,
        bodyType,
        body: input,
      },
      ...(output?.example && {
        output: {
          type: "json",
          example: output.example,
        },
      }),
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        input: {
          type: "object",
          properties: {
            type: {
              type: "string",
              const: "http",
            },
            method: {
              type: "string",
              enum: [method] as BodyMethods[],
            },
            bodyType: {
              type: "string",
              enum: ["json", "form-data", "text"],
            },
            body: inputSchema,
          },
          required: ["type", "method", "bodyType", "body"],
          additionalProperties: false,
        },
        ...(output?.example && {
          output: {
            type: "object" as const,
            properties: {
              type: {
                type: "string" as const,
              },
              example: {
                type: "object" as const,
                ...(output?.schema || {}),
              },
            },
            required: ["type"] as const,
          },
        }),
      },
      required: ["input"],
    },
  };
}

/**
 * Create a discovery extension for any HTTP method
 * 
 * This function helps servers declare how their endpoint should be called,
 * including the expected input parameters/body and output format.
 * 
 * @param config - Configuration object for the discovery extension
 * @returns A discovery extension object with both info and schema
 * 
 * @example
 * ```typescript
 * // For a GET endpoint with no input
 * const getExtension = declareDiscoveryExtension({
 *   method: "GET",
 *   output: {
 *     example: { message: "Success", timestamp: "2024-01-01T00:00:00Z" }
 *   }
 * });
 * 
 * // For a GET endpoint with query params
 * const getWithParams = declareDiscoveryExtension({
 *   method: "GET",
 *   input: { query: "example" },
 *   inputSchema: {
 *     properties: {
 *       query: { type: "string" }
 *     },
 *     required: ["query"]
 *   }
 * });
 * 
 * // For a POST endpoint with JSON body
 * const postExtension = declareDiscoveryExtension({
 *   method: "POST",
 *   input: { name: "John", age: 30 },
 *   inputSchema: {
 *     properties: {
 *       name: { type: "string" },
 *       age: { type: "number" }
 *     },
 *     required: ["name"]
 *   },
 *   bodyType: "json",
 *   output: {
 *     example: { success: true, id: "123" }
 *   }
 * });
 * ```
 */
export function declareDiscoveryExtension(
  config: DeclareDiscoveryExtensionConfig
): DiscoveryExtension {
  if (isQueryExtensionConfig(config)) {
    return createQueryDiscoveryExtension(config);
  } else if (isBodyExtensionConfig(config)) {
    return createBodyDiscoveryExtension(config);
  } else {
    throw new Error(`Unsupported HTTP method: ${config}`);
  }
}

