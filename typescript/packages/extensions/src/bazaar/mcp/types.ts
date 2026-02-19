/**
 * MCP-specific type definitions for the Bazaar Discovery Extension
 */

import type { DiscoveryInfo } from "../types";

/**
 * Discovery info for MCP tools
 */
export interface McpDiscoveryInfo {
  input: {
    type: "mcp";
    tool: string;
    description?: string;
    transport?: "streamable-http" | "sse";
    inputSchema: Record<string, unknown>;
    example?: Record<string, unknown>;
  };
  output?: {
    type?: string;
    format?: string;
    example?: unknown;
  };
}

/**
 * Discovery extension for MCP tools
 */
export interface McpDiscoveryExtension {
  info: McpDiscoveryInfo;

  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema";
    type: "object";
    properties: {
      input: {
        type: "object";
        properties: {
          type: {
            type: "string";
            const: "mcp";
          };
          tool: {
            type: "string";
          };
          description?: {
            type: "string";
          };
          transport?: {
            type: "string";
            enum: ["streamable-http", "sse"];
          };
          inputSchema: Record<string, unknown>;
          example?: Record<string, unknown>;
        };
        required: ("type" | "tool" | "inputSchema")[];
        additionalProperties?: boolean;
      };
      output?: {
        type: "object";
        properties?: Record<string, unknown>;
        required?: readonly string[];
        additionalProperties?: boolean;
      };
    };
    required: ["input"];
  };
}

export interface DeclareMcpDiscoveryExtensionConfig {
  tool: string;
  description?: string;
  transport?: "streamable-http" | "sse";
  inputSchema: Record<string, unknown>;
  example?: Record<string, unknown>;
  output?: {
    example?: unknown;
    schema?: Record<string, unknown>;
  };
}

export interface DiscoveredMCPResource {
  resourceUrl: string;
  description?: string;
  mimeType?: string;
  tool: string;
  x402Version: number;
  discoveryInfo: DiscoveryInfo;
}

export const isMcpExtensionConfig = (
  config: DeclareMcpDiscoveryExtensionConfig | Record<string, unknown>,
): config is DeclareMcpDiscoveryExtensionConfig => {
  return "tool" in config;
};
