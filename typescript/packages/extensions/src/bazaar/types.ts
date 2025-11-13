/**
 * Type definitions for the Bazaar Discovery Extension
 */

import type { BodyMethods, QueryParamMethods } from "@x402/core/http";

/**
 * Extension identifier constant for the Bazaar discovery extension
 */
export const BAZAAR = "bazaar";

/**
 * Discovery info for query parameter methods (GET, HEAD, DELETE)
 */
export interface QueryDiscoveryInfo {
  input: {
    type: "http";
    method: QueryParamMethods;
    queryParams?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  output?: {
    type?: string;
    format?: string;
    example?: unknown;
  };
}

/**
 * Discovery info for body methods (POST, PUT, PATCH)
 */
export interface BodyDiscoveryInfo {
  input: {
    type: "http";
    method: BodyMethods;
    bodyType: "json" | "form-data" | "text";
    body: Record<string, unknown>;
    queryParams?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  output?: {
    type?: string;
    format?: string;
    example?: unknown;
  };
}

/**
 * Combined discovery info type
 */
export type DiscoveryInfo = QueryDiscoveryInfo | BodyDiscoveryInfo;

/**
 * Discovery extension for query parameter methods (GET, HEAD, DELETE)
 */
export interface QueryDiscoveryExtension {
  info: QueryDiscoveryInfo;

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
            properties?: Record<string, unknown>;
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
        required: ("type" | "method")[];
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

/**
 * Discovery extension for body methods (POST, PUT, PATCH)
 */
export interface BodyDiscoveryExtension {
  info: BodyDiscoveryInfo;

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
          body: Record<string, unknown>;
          queryParams?: {
            type: "object";
            properties?: Record<string, unknown>;
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
        required: ("type" | "method" | "bodyType" | "body")[];
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

/**
 * Combined discovery extension type
 */
export type DiscoveryExtension = QueryDiscoveryExtension | BodyDiscoveryExtension;

export interface DeclareQueryDiscoveryExtensionConfig {
  method?: QueryParamMethods;
  input?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  output?: {
    example?: unknown;
    schema?: Record<string, unknown>;
  };
}

export interface DeclareBodyDiscoveryExtensionConfig {
  method?: BodyMethods;
  input?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  bodyType?: "json" | "form-data" | "text";
  output?: {
    example?: unknown;
    schema?: Record<string, unknown>;
  };
}

export type DeclareDiscoveryExtensionConfig =
  | DeclareQueryDiscoveryExtensionConfig
  | DeclareBodyDiscoveryExtensionConfig;

export const isQueryExtensionConfig = (
  config: DeclareDiscoveryExtensionConfig,
): config is DeclareQueryDiscoveryExtensionConfig => {
  return !("bodyType" in config);
};

export const isBodyExtensionConfig = (
  config: DeclareDiscoveryExtensionConfig,
): config is DeclareBodyDiscoveryExtensionConfig => {
  return "bodyType" in config;
};
