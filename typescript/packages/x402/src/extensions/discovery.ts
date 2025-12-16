/**
 * Discovery Extension for x402 Bazaar
 *
 * This extension allows resource servers to declare discovery metadata
 * that will be registered with the facilitator's Bazaar catalog.
 *
 * @example
 * ```typescript
 * import { declareDiscoveryExtension } from "@b3dotfun/anyspend-x402/extensions";
 *
 * app.use(paymentMiddleware("0xAddr", {
 *   "/weather": {
 *     price: "$0.01",
 *     network: "base",
 *     config: {
 *       ...declareDiscoveryExtension({
 *         discoverable: true,
 *         output: {
 *           example: { temperature: 72, conditions: "sunny" },
 *           schema: {
 *             type: "object",
 *             properties: {
 *               temperature: { type: "number" },
 *               conditions: { type: "string" },
 *             },
 *           },
 *         },
 *         metadata: {
 *           name: "Weather API",
 *           description: "Real-time weather data",
 *           category: "data",
 *           tags: ["weather", "api"],
 *         },
 *       }),
 *     },
 *   },
 * }, facilitator));
 * ```
 */

import { DiscoveryMetadata } from "../types/shared/middleware";

/**
 * Simplified JSON Schema type (compatible with JSON Schema Draft 7)
 */
export type JSONSchema = {
  [key: string]: unknown;
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
};

/**
 * Schema definition for input/output
 */
export interface SchemaDefinition {
  /**
   * Example value for documentation and testing
   */
  example?: unknown;

  /**
   * JSON Schema definition
   */
  schema?: JSONSchema;
}

// Re-export DiscoveryMetadata for convenience
export { DiscoveryMetadata };

/**
 * Options for declareDiscoveryExtension
 */
export interface DiscoveryExtensionOptions {
  /**
   * Whether this endpoint should be discoverable in the Bazaar
   *
   * @default true
   */
  discoverable?: boolean;

  /**
   * Input schema definition (request body/params)
   */
  input?: SchemaDefinition;

  /**
   * Output schema definition (response)
   */
  output?: SchemaDefinition;

  /**
   * Metadata for the discovery catalog
   */
  metadata?: DiscoveryMetadata;
}

/**
 * Result of declareDiscoveryExtension to spread into config
 */
export interface DiscoveryExtensionConfig {
  discoverable: boolean;
  discoveryInput?: SchemaDefinition;
  discoveryOutput?: SchemaDefinition;
  discoveryMetadata?: DiscoveryMetadata;
}

/**
 * Declares discovery metadata for a payment-protected endpoint.
 *
 * This helper function creates the configuration needed for automatic
 * registration with the facilitator's Bazaar discovery catalog.
 *
 * @param options - Discovery extension options
 * @returns Configuration object to spread into PaymentMiddlewareConfig
 *
 * @example
 * ```typescript
 * // Basic usage - just make discoverable
 * config: {
 *   ...declareDiscoveryExtension({ discoverable: true })
 * }
 *
 * // With output schema
 * config: {
 *   ...declareDiscoveryExtension({
 *     output: {
 *       example: { temperature: 72 },
 *       schema: { type: "object", properties: { temperature: { type: "number" } } }
 *     }
 *   })
 * }
 *
 * // Full metadata
 * config: {
 *   ...declareDiscoveryExtension({
 *     discoverable: true,
 *     input: {
 *       example: { city: "San Francisco" },
 *       schema: { type: "object", properties: { city: { type: "string" } } }
 *     },
 *     output: {
 *       example: { temperature: 72, conditions: "sunny" },
 *       schema: {
 *         type: "object",
 *         properties: {
 *           temperature: { type: "number" },
 *           conditions: { type: "string" }
 *         }
 *       }
 *     },
 *     metadata: {
 *       name: "Weather API",
 *       category: "data",
 *       tags: ["weather"],
 *       provider: "WeatherCorp"
 *     }
 *   })
 * }
 * ```
 */
export function declareDiscoveryExtension(
  options: DiscoveryExtensionOptions = {},
): DiscoveryExtensionConfig {
  const { discoverable = true, input, output, metadata } = options;

  const config: DiscoveryExtensionConfig = {
    discoverable,
  };

  // Only add discoveryInput if it has meaningful content
  if (input?.example !== undefined || input?.schema) {
    config.discoveryInput = {
      ...(input.example !== undefined && { example: input.example }),
      ...(input.schema && { schema: input.schema }),
    };
  }

  // Only add discoveryOutput if it has meaningful content
  if (output?.example !== undefined || output?.schema) {
    config.discoveryOutput = {
      ...(output.example !== undefined && { example: output.example }),
      ...(output.schema && { schema: output.schema }),
    };
  }

  if (metadata && Object.keys(metadata).length > 0) {
    config.discoveryMetadata = metadata;
  }

  return config;
}

/**
 * Type guard to check if config has discovery extension
 *
 * @param config - The configuration object to check
 * @returns True if the config has discovery extension properties
 */
export function hasDiscoveryExtension(config: unknown): config is DiscoveryExtensionConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "discoverable" in config &&
    typeof (config as DiscoveryExtensionConfig).discoverable === "boolean"
  );
}
