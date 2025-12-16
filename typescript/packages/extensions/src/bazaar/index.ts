/**
 * Bazaar Discovery Extension for x402 v2 and v1
 *
 * Enables facilitators to automatically catalog and index x402-enabled resources
 * by following the server's provided discovery instructions.
 *
 * ## V2 Usage
 *
 * The v2 extension follows a pattern where:
 * - `info`: Contains the actual discovery data (the values)
 * - `schema`: JSON Schema that validates the structure of `info`
 *
 * ### For Resource Servers (V2)
 *
 * ```typescript
 * import { declareDiscoveryExtension, BAZAAR } from '@x402/extensions/bazaar';
 *
 * // Declare a GET endpoint
 * const extension = declareDiscoveryExtension(
 *   "GET",
 *   { query: "example" },
 *   {
 *     properties: {
 *       query: { type: "string" }
 *     },
 *     required: ["query"]
 *   }
 * );
 *
 * // Include in PaymentRequired response
 * const paymentRequired = {
 *   x402Version: 2,
 *   resource: { ... },
 *   accepts: [ ... ],
 *   extensions: {
 *     [BAZAAR]: extension
 *   }
 * };
 * ```
 *
 * ### For Facilitators (V2 and V1)
 *
 * ```typescript
 * import {
 *   extractDiscoveryInfo,
 *   BAZAAR
 * } from '@x402/extensions/bazaar';
 *
 * // V2: Extensions are in PaymentPayload.extensions (client copied from PaymentRequired)
 * // V1: Discovery info is in PaymentRequirements.outputSchema
 * const info = extractDiscoveryInfo(
 *   paymentPayload,
 *   paymentRequirements
 * );
 *
 * if (info) {
 *   // Catalog info in Bazaar
 * }
 * ```
 *
 * ## V1 Support
 *
 * V1 discovery information is stored in the `outputSchema` field of PaymentRequirements.
 * The `extractDiscoveryInfo` function automatically handles v1 format as a fallback.
 *
 * ```typescript
 * import { extractDiscoveryInfoV1 } from '@x402/extensions/bazaar/v1';
 *
 * // Direct v1 extraction
 * const infoV1 = extractDiscoveryInfoV1(paymentRequirementsV1);
 * ```
 */

// Export types
export type {
  DiscoveryInfo,
  QueryDiscoveryInfo,
  BodyDiscoveryInfo,
  QueryDiscoveryExtension,
  BodyDiscoveryExtension,
  DiscoveryExtension,
} from "./types";

export { BAZAAR } from "./types";

// Export resource service functions (for servers)
export { declareDiscoveryExtension } from "./resourceService";

export { bazaarResourceServerExtension } from "./server";

// Export facilitator functions (for facilitators)
export {
  validateDiscoveryExtension,
  extractDiscoveryInfo,
  extractDiscoveryInfoFromExtension,
  validateAndExtract,
  type ValidationResult,
} from "./facilitator";

// Export v1 functions (v1 data is transformed to v2 DiscoveryInfo format)
export { extractDiscoveryInfoV1, isDiscoverableV1, extractResourceMetadataV1 } from "./v1";

// Export client extension (for facilitator clients querying discovery)
export {
  withBazaar,
  BazaarClientExtension,
  ListDiscoveryResourcesParams,
  DiscoveryResource,
  DiscoveryResourcesResponse,
} from "./facilitatorClient";
