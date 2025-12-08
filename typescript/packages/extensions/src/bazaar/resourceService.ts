/**
 * Resource Service functions for creating Bazaar discovery extensions
 *
 * These functions help servers declare the shape of their endpoints
 * for facilitator discovery and cataloging in the Bazaar.
 */

import {
  type DiscoveryExtension,
  type QueryDiscoveryExtension,
  type BodyDiscoveryExtension,
  type DeclareDiscoveryExtensionConfig,
  type DeclareQueryDiscoveryExtensionConfig,
  type DeclareBodyDiscoveryExtensionConfig,
} from "./types";

/**
 * Internal helper to create a query discovery extension
 *
 * @param root0 - Configuration object for query discovery extension
 * @param root0.method - HTTP method (GET, HEAD, DELETE)
 * @param root0.input - Query parameters
 * @param root0.inputSchema - JSON schema for query parameters
 * @param root0.output - Output specification with example
 * @returns QueryDiscoveryExtension with info and schema
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
        ...(method ? { method } : {}),
        ...(input ? { queryParams: input } : {}),
      } as QueryDiscoveryExtension["info"]["input"],
      ...(output?.example
        ? {
            output: {
              type: "json",
              example: output.example,
            },
          }
        : {}),
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
              enum: ["GET", "HEAD", "DELETE"],
            },
            ...(inputSchema
              ? {
                  queryParams: {
                    type: "object" as const,
                    ...(typeof inputSchema === "object" ? inputSchema : {}),
                  },
                }
              : {}),
          },
          required: ["type"] as ("type" | "method")[],
          additionalProperties: false,
        },
        ...(output?.example
          ? {
              output: {
                type: "object" as const,
                properties: {
                  type: {
                    type: "string" as const,
                  },
                  example: {
                    type: "object" as const,
                    ...(output.schema && typeof output.schema === "object" ? output.schema : {}),
                  },
                },
                required: ["type"] as const,
              },
            }
          : {}),
      },
      required: ["input"],
    },
  };
}

/**
 * Internal helper to create a body discovery extension
 *
 * @param root0 - Configuration object for body discovery extension
 * @param root0.method - HTTP method (POST, PUT, PATCH)
 * @param root0.input - Request body specification
 * @param root0.inputSchema - JSON schema for request body
 * @param root0.bodyType - Content type of body (json, form, multipart)
 * @param root0.output - Output specification with example
 * @returns BodyDiscoveryExtension with info and schema
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
        ...(method ? { method } : {}),
        bodyType,
        body: input,
      } as BodyDiscoveryExtension["info"]["input"],
      ...(output?.example
        ? {
            output: {
              type: "json",
              example: output.example,
            },
          }
        : {}),
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
              enum: ["POST", "PUT", "PATCH"],
            },
            bodyType: {
              type: "string",
              enum: ["json", "form-data", "text"],
            },
            body: inputSchema,
          },
          required: ["type", "bodyType", "body"] as ("type" | "method" | "bodyType" | "body")[],
          additionalProperties: false,
        },
        ...(output?.example
          ? {
              output: {
                type: "object" as const,
                properties: {
                  type: {
                    type: "string" as const,
                  },
                  example: {
                    type: "object" as const,
                    ...(output.schema && typeof output.schema === "object" ? output.schema : {}),
                  },
                },
                required: ["type"] as const,
              },
            }
          : {}),
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
  config: Omit<DeclareDiscoveryExtensionConfig, "method">,
): Record<string, DiscoveryExtension> {
  const bodyType = (config as DeclareBodyDiscoveryExtensionConfig).bodyType;
  const isBodyMethod = bodyType !== undefined;

  const extension = isBodyMethod
    ? createBodyDiscoveryExtension(config as DeclareBodyDiscoveryExtensionConfig)
    : createQueryDiscoveryExtension(config as DeclareQueryDiscoveryExtensionConfig);

  return { bazaar: extension as DiscoveryExtension };
}
