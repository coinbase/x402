/**
 * Zod schemas for validating Facilitator Fees Extension data
 *
 * ## Design Philosophy
 *
 * **Server-side routing is primary.** The Quote API is the core mechanism
 * for fee discovery. Client preferences are optional and advisory.
 */

import { z } from "zod";

/**
 * Fee model enum schema
 */
export const FeeModelSchema = z.enum(["flat", "bps", "tiered", "hybrid"]);

/**
 * Signature scheme enum schema
 */
export const SignatureSchemeSchema = z.enum(["eip191", "ed25519"]);

/**
 * Base facilitator fee quote schema (before model-specific validation)
 */
const BaseFacilitatorFeeQuoteSchema = z.object({
  quoteId: z.string(),
  facilitatorAddress: z.string(),
  network: z.string(),
  model: FeeModelSchema,
  asset: z.string(),
  flatFee: z.string().optional(),
  bps: z.number().int().nonnegative().max(10000).optional(),
  minFee: z.string().optional(),
  maxFee: z.string().optional(),
  expiry: z.number().int().positive(),
  signature: z.string(),
  signatureScheme: SignatureSchemeSchema,
});

/**
 * Facilitator fee quote schema with model-specific validation
 *
 * - `flat` model: requires `flatFee`
 * - `bps` model: requires `bps`, `maxFee` RECOMMENDED (enables fee comparison)
 * - `tiered`/`hybrid` models: `maxFee` recommended but not required
 */
export const FacilitatorFeeQuoteSchema = BaseFacilitatorFeeQuoteSchema.superRefine((data, ctx) => {
  if (data.model === "flat" && data.flatFee === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "flatFee is required for flat fee model",
      path: ["flatFee"],
    });
  }

  if (data.model === "bps" && data.bps === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bps is required for BPS fee model",
      path: ["bps"],
    });
  }
  // Note: maxFee is RECOMMENDED for BPS (enables fee comparison) but not required.
});

/**
 * Facilitator fee bid schema (client preferences - optional and advisory)
 *
 * All fields are optional. Servers SHOULD try to honor preferences but are not required to.
 */
export const FacilitatorFeeBidSchema = z.object({
  maxTotalFee: z.string().optional(),
  asset: z.string().optional(),
});

/**
 * PaymentPayload info schema (client preferences)
 */
export const FacilitatorFeesPaymentPayloadInfoSchema = z.object({
  version: z.literal("1"),
  facilitatorFeeBid: FacilitatorFeeBidSchema.optional(),
});

/**
 * SettlementResponse info schema (receipt - core)
 *
 * The settlement receipt provides transparency about actual fees charged.
 */
export const FacilitatorFeesSettlementInfoSchema = z.object({
  version: z.literal("1"),
  facilitatorFeePaid: z.string(),
  asset: z.string(),
  facilitatorId: z.string().optional(),
  model: FeeModelSchema.optional(),
});

// =============================================================================
// Facilitator Quote API Schemas (GET /x402/fee-quote) - Core
// =============================================================================

/**
 * Fee quote request schema (query parameters)
 *
 * This is the primary mechanism for fee discovery. Servers call this API
 * to get quotes from multiple facilitators for cost-aware routing.
 */
export const FeeQuoteRequestSchema = z.object({
  network: z.string(),
  asset: z.string(),
  amount: z.string().optional(),
});

/**
 * Fee quote response schema
 */
export const FeeQuoteResponseSchema = z.object({
  facilitatorFeeQuote: FacilitatorFeeQuoteSchema,
});

/**
 * Fee quote error codes
 */
export const FeeQuoteErrorCodeSchema = z.enum([
  "UNSUPPORTED_NETWORK",
  "UNSUPPORTED_ASSET",
  "INVALID_AMOUNT",
]);

/**
 * Fee quote error response schema
 */
export const FeeQuoteErrorResponseSchema = z.object({
  error: FeeQuoteErrorCodeSchema,
  message: z.string(),
});

/**
 * JSON Schema for PaymentPayload extension (for embedding in the extension)
 */
export const FACILITATOR_FEES_PAYMENT_PAYLOAD_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    version: { type: "string", const: "1" },
    facilitatorFeeBid: {
      type: "object",
      properties: {
        maxTotalFee: { type: "string" },
        asset: { type: "string" },
      },
    },
  },
  required: ["version"],
} as const;

/**
 * JSON Schema for SettlementResponse extension (receipt)
 */
export const FACILITATOR_FEES_SETTLEMENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    version: { type: "string", const: "1" },
    facilitatorFeePaid: { type: "string" },
    asset: { type: "string" },
    facilitatorId: { type: "string" },
    model: { type: "string", enum: ["flat", "bps", "tiered", "hybrid"] },
  },
  required: ["version", "facilitatorFeePaid", "asset"],
} as const;
