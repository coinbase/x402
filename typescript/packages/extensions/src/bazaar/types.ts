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
    queryParams?: Record<string, any>;
    headers?: Record<string, string>;
  };
  output?: {
    type?: string;
    format?: string;
    example?: any;
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
    body: any;
    queryParams?: Record<string, any>;
    headers?: Record<string, string>;
  };
  output?: {
    type?: string;
    format?: string;
    example?: any;
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
 * Configuration for declaring a discovery extension
 */
export interface DeclareQueryDiscoveryExtensionConfig {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD) */
  method: QueryParamMethods;

  /** Example input data (query params for GET/HEAD/DELETE, body for POST/PUT/PATCH) */
  input?: any;

  /** JSON Schema for the input */
  inputSchema?: Record<string, any>;

  /** Output configuration */
  output?: {
    /** Example output data */
    example?: any;
    /** JSON Schema for the output example */
    schema?: Record<string, any>;
  };
}

/**
 * Configuration for declaring a discovery extension
 */
export interface DeclareBodyDiscoveryExtensionConfig {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD) */
  method: BodyMethods;

  /** Example input data (query params for GET/HEAD/DELETE, body for POST/PUT/PATCH) */
  input?: any;

  /** JSON Schema for the input */
  inputSchema?: Record<string, any>;

  /** Body type for POST/PUT/PATCH methods */
  bodyType?: "json" | "form-data" | "text";

  /** Output configuration */
  output?: {
    /** Example output data */
    example?: any;
    /** JSON Schema for the output example */
    schema?: Record<string, any>;
  };
}

export type DeclareDiscoveryExtensionConfig = DeclareQueryDiscoveryExtensionConfig | DeclareBodyDiscoveryExtensionConfig;


// make it a typeguard
export const isQueryExtensionConfig = (config: DeclareDiscoveryExtensionConfig): config is DeclareQueryDiscoveryExtensionConfig => {
  return ["GET", "HEAD", "DELETE"].includes(config.method);
}

export const isBodyExtensionConfig = (config: DeclareDiscoveryExtensionConfig): config is DeclareBodyDiscoveryExtensionConfig => {
  return ["POST", "PUT", "PATCH"].includes(config.method);
}