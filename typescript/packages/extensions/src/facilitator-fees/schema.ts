/**
 * Zod schemas for validating Facilitator Fees Extension data
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
 * - `bps` model: requires `bps`, `maxFee` RECOMMENDED (clients may exclude uncapped BPS quotes)
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
  // Clients may exclude BPS quotes without maxFee from fee-constrained routing.
});

/**
 * Facilitator option schema
 */
export const FacilitatorOptionSchema = z
  .object({
    facilitatorId: z.string().url(),
    facilitatorFeeQuote: FacilitatorFeeQuoteSchema.optional(),
    facilitatorFeeQuoteRef: z.string().url().optional(),
    maxFacilitatorFee: z.string().optional(),
  })
  .refine(
    data =>
      data.facilitatorFeeQuote !== undefined ||
      data.facilitatorFeeQuoteRef !== undefined ||
      data.maxFacilitatorFee !== undefined,
    {
      message:
        "At least one of facilitatorFeeQuote, facilitatorFeeQuoteRef, or maxFacilitatorFee must be provided",
    },
  );

/**
 * PaymentRequired info schema
 */
export const FacilitatorFeesPaymentRequiredInfoSchema = z.object({
  version: z.literal("1"),
  options: z.array(FacilitatorOptionSchema).min(1),
});

/**
 * Facilitator fee bid schema
 */
export const FacilitatorFeeBidSchema = z.object({
  maxTotalFee: z.string(),
  asset: z.string(),
  selectedQuoteId: z.string().optional(),
});

/**
 * PaymentPayload info schema
 */
export const FacilitatorFeesPaymentPayloadInfoSchema = z.object({
  version: z.literal("1"),
  facilitatorFeeBid: FacilitatorFeeBidSchema,
});

/**
 * SettlementResponse info schema
 */
export const FacilitatorFeesSettlementInfoSchema = z.object({
  version: z.literal("1"),
  facilitatorFeePaid: z.string(),
  asset: z.string(),
  quoteId: z.string().optional(),
  facilitatorId: z.string().optional(),
  model: FeeModelSchema.optional(),
});

/**
 * JSON Schema for PaymentRequired extension (for embedding in the extension)
 */
export const FACILITATOR_FEES_PAYMENT_REQUIRED_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    version: { type: "string", const: "1" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          facilitatorId: { type: "string" },
          facilitatorFeeQuote: {
            type: "object",
            properties: {
              quoteId: { type: "string" },
              facilitatorAddress: { type: "string" },
              model: { type: "string", enum: ["flat", "bps", "tiered", "hybrid"] },
              asset: { type: "string" },
              flatFee: { type: "string" },
              bps: { type: "number", minimum: 0, maximum: 10000 },
              minFee: { type: "string" },
              maxFee: { type: "string" },
              expiry: { type: "number" },
              signature: { type: "string" },
              signatureScheme: { type: "string", enum: ["eip191", "ed25519"] },
            },
            required: [
              "quoteId",
              "facilitatorAddress",
              "model",
              "asset",
              "expiry",
              "signature",
              "signatureScheme",
            ],
          },
          facilitatorFeeQuoteRef: { type: "string", format: "uri" },
          maxFacilitatorFee: { type: "string" },
        },
        required: ["facilitatorId"],
      },
      minItems: 1,
    },
  },
  required: ["version", "options"],
} as const;
