/**
 * MCP resource service functions for creating Bazaar discovery extensions
 */

import type { McpDiscoveryExtension, DeclareMcpDiscoveryExtensionConfig } from "./types";

/**
 * Create an MCP tool discovery extension
 *
 * @param root0 - Configuration object for MCP discovery extension
 * @param root0.tool - MCP tool name
 * @param root0.description - Tool description
 * @param root0.inputSchema - JSON Schema for tool arguments
 * @param root0.example - Example tool arguments
 * @param root0.output - Output specification with example
 * @param root0.transport - MCP transport type (streamable-http or sse)
 * @returns McpDiscoveryExtension with info and schema
 */
export function createMcpDiscoveryExtension({
  tool,
  description,
  transport,
  inputSchema,
  example,
  output,
}: DeclareMcpDiscoveryExtensionConfig): McpDiscoveryExtension {
  return {
    info: {
      input: {
        type: "mcp",
        tool,
        ...(description !== undefined ? { description } : {}),
        ...(transport !== undefined ? { transport } : {}),
        inputSchema,
        ...(example !== undefined ? { example } : {}),
      },
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
              const: "mcp",
            },
            tool: {
              type: "string",
            },
            ...(description !== undefined
              ? {
                  description: {
                    type: "string" as const,
                  },
                }
              : {}),
            ...(transport !== undefined
              ? {
                  transport: {
                    type: "string" as const,
                    enum: ["streamable-http", "sse"],
                  },
                }
              : {}),
            inputSchema: {
              type: "object" as const,
            },
            ...(example !== undefined
              ? {
                  example: {
                    type: "object" as const,
                  },
                }
              : {}),
          },
          required: ["type", "tool", "inputSchema"] as ("type" | "tool" | "inputSchema")[],
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
