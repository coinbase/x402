/**
 * Discovery Extension for x402 v2
 * 
 * Enables facilitators to automatically catalog and index x402-enabled resources
 * by following the server's provided discovery instructions.
 * 
 * The extension follows the x402 v2 pattern where:
 * - `info`: Contains the actual discovery data (the values)
 * - `schema`: JSON Schema that validates the structure of `info`
 */

import { BodyMethods, QueryParamMethods } from "@x402/core/http";

/**
 * Discovery extension for query parameter methods (GET, HEAD, DELETE)
 */
export interface QueryDiscoveryExtension {
  info: {
    input: {
      type: "http";
      method: QueryParamMethods;
      queryParams?: Record<string, any>;
      headers?: Record<string, string>;
    };
    output?: {
      type?: string;
      format?: string;
      example?: any;
    };
  };

  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema";
    type: "object";
    properties: {
      input: {
        type: "object";
        properties: {
          type: {
            type: "string";
            const: "http";
          };
          method: {
            type: "string";
            enum: QueryParamMethods[];
          };
          queryParams?: {
            type: "object";
            properties?: Record<string, any>;
            required?: string[];
            additionalProperties?: boolean;
          };
          headers?: {
            type: "object";
            additionalProperties: {
              type: "string";
            };
          };
        };
        required: ["type", "method"];
        additionalProperties?: boolean;
      };
      output?: {
        type: "object";
        properties?: Record<string, any>;
        additionalProperties?: boolean;
      };
    };
    required: ["input"];
  };
}

/**
 * Discovery extension for body methods (POST, PUT, PATCH)
 */
export interface BodyDiscoveryExtension {
  info: {
    input: {
      type: "http";
      method: BodyMethods;
      bodyType: "json" | "form-data" | "text";
      body: any;
      queryParams?: Record<string, any>;
      headers?: Record<string, string>;
    };
    output?: {
      type?: string;
      format?: string;
      example?: any;
    };
  };

  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema";
    type: "object";
    properties: {
      input: {
        type: "object";
        properties: {
          type: {
            type: "string";
            const: "http";
          };
          method: {
            type: "string";
            enum: BodyMethods[];
          };
          bodyType: {
            type: "string";
            enum: ["json", "form-data", "text"];
          };
          body: Record<string, any>;
          queryParams?: {
            type: "object";
            properties?: Record<string, any>;
            required?: string[];
            additionalProperties?: boolean;
          };
          headers?: {
            type: "object";
            additionalProperties: {
              type: "string";
            };
          };
        };
        required: ["type", "method", "bodyType", "body"];
        additionalProperties?: boolean;
      };
      output?: {
        type: "object";
        properties?: Record<string, any>;
        additionalProperties?: boolean;
      };
    };
    required: ["input"];
  };
}

/**
 * Combined discovery extension type
 */
export type DiscoveryExtension = QueryDiscoveryExtension | BodyDiscoveryExtension;


/**
 * Internal helper to create a query discovery extension
 */
function createQueryDiscoveryExtension(
  method: QueryParamMethods,
  input: any,
  inputSchema: Record<string, any>,
  output?: {
    example?: any;
    schema?: Record<string, any>;
  }
): QueryDiscoveryExtension {
  return {
    info: {
      input: {
        type: "http",
        method,
        ...(input && { queryParams: input })
      },
      ...(output?.example && {
        output: {
          type: "json",
          example: output.example
        }
      })
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
              const: "http"
            },
            method: {
              type: "string",
              enum: [method] as QueryParamMethods[]
            },
            ...(inputSchema && {
              queryParams: {
                type: "object" as const,
                ...inputSchema
              }
            })
          },
          required: ["type", "method"],
          additionalProperties: false
        },
        ...(output?.schema && {
          output: {
            type: "object" as const,
            ...output.schema
          }
        })
      },
      required: ["input"]
    }
  };
}

/**
 * Internal helper to create a body discovery extension
 */
function createBodyDiscoveryExtension(
  method: BodyMethods,
  input: any,
  inputSchema: Record<string, any>,
  options?: {
    bodyType?: "json" | "form-data" | "text";
    output?: {
      example?: any;
      schema?: Record<string, any>;
    };
  }
): BodyDiscoveryExtension {
  const bodyType = options?.bodyType || "json";

  return {
    info: {
      input: {
        type: "http",
        method,
        bodyType,
        body: input
      },
      ...(options?.output?.example && {
        output: {
          type: "json",
          example: options.output.example
        }
      })
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
              const: "http"
            },
            method: {
              type: "string",
              enum: [method] as BodyMethods[]
            },
            bodyType: {
              type: "string",
              enum: ["json", "form-data", "text"]
            },
            body: inputSchema
          },
          required: ["type", "method", "bodyType", "body"],
          additionalProperties: false
        },
        ...(options?.output?.schema && {
          output: {
            type: "object" as const,
            ...options.output.schema
          }
        })
      },
      required: ["input"]
    }
  };
}

/**
 * Create a discovery extension for any HTTP method
 * 
 * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD)
 * @param input - Example input data (query params for GET/HEAD/DELETE, body for POST/PUT/PATCH)
 * @param inputSchema - JSON Schema for the input
 * @param options - Additional options including output schema and body type
 */
export function declareDiscoveryExtension(
  method: QueryParamMethods | BodyMethods,
  input: any,
  inputSchema: Record<string, any>,
  options?: {
    bodyType?: "json" | "form-data" | "text";
    output?: {
      example?: any;
      schema?: Record<string, any>;
    };
  }
): DiscoveryExtension {
  if (["GET", "HEAD", "DELETE"].includes(method)) {
    return createQueryDiscoveryExtension(
      method as QueryParamMethods,
      input,
      inputSchema,
      options?.output
    );
  } else if (["POST", "PUT", "PATCH"].includes(method)) {
    return createBodyDiscoveryExtension(
      method as BodyMethods,
      input,
      inputSchema,
      options
    );
  } else {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
}