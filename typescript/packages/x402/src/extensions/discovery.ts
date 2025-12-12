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

/**
 * Simplified JSON Schema type (compatible with JSON Schema Draft 7)
 */
export type JSONSchema = {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
  [key: string]: unknown;
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

/**
 * Metadata for discovery catalog
 */
export interface DiscoveryMetadata {
  /**
   * Human-readable name for the service
   */
  name?: string;

  /**
   * Description of what the service does
   */
  description?: string;

  /**
   * Category for filtering (e.g., "data", "ai", "finance")
   */
  category?: string;

  /**
   * Tags for search and filtering
   */
  tags?: string[];

  /**
   * URL to documentation
   */
  documentation?: string;

  /**
   * URL to logo image
   */
  logo?: string;

  /**
   * Provider/organization name
   */
  provider?: string;

  /**
   * Additional custom metadata
   */
  [key: string]: unknown;
}

/**
 * Options for declareDiscoveryExtension
 */
export interface DiscoveryExtensionOptions {
  /**
   * Whether this endpoint should be discoverable in the Bazaar
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
  inputSchema?: {
    example?: unknown;
    schema?: JSONSchema;
  };
  outputSchema?: {
    example?: unknown;
    schema?: JSONSchema;
  };
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
  options: DiscoveryExtensionOptions = {}
): DiscoveryExtensionConfig {
  const { discoverable = true, input, output, metadata } = options;

  const config: DiscoveryExtensionConfig = {
    discoverable,
  };

  if (input) {
    config.inputSchema = {
      ...(input.example !== undefined && { example: input.example }),
      ...(input.schema && { schema: input.schema }),
    };
  }

  if (output) {
    config.outputSchema = {
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
 */
export function hasDiscoveryExtension(
  config: unknown
): config is DiscoveryExtensionConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "discoverable" in config &&
    typeof (config as DiscoveryExtensionConfig).discoverable === "boolean"
  );
}
