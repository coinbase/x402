import { z } from "zod";
import { NetworkSchema } from "../shared";
import { MixedAddressRegex } from "./constants";
import {
  EXACT_SCHEME,
  ExactErrorReasons,
  ExactPaymentPayloadSchema,
  ExactPaymentRequirementsSchema,
  UnsignedExactPaymentPayloadSchema,
} from "./schemes/exact";
import {
  DEFERRRED_SCHEME,
  DeferredErrorReasons,
  DeferredPaymentPayloadSchema,
  DeferredPaymentRequirementsSchema,
  DeferredSchemeContextSchema,
  UnsignedDeferredPaymentPayloadSchema,
} from "./schemes/deferred";
import { x402Versions } from "./versions";
import { EvmOrSvmAddress } from "./schemes/base";

// Enums
export const X402_SCHEMES = [EXACT_SCHEME, DEFERRRED_SCHEME] as const;
export type X402_SCHEMES = (typeof X402_SCHEMES)[number];
export const ErrorReasons = [
  "insufficient_funds",
  "invalid_network",
  "invalid_network_unsupported",
  "invalid_client_network",
  "invalid_payload",
  "invalid_payment_requirements",
  "invalid_scheme",
  "invalid_payment",
  "payment_expired",
  "unsupported_scheme",
  "invalid_x402_version",
  "invalid_transaction_state",
  "invalid_transaction_reverted",
  "unexpected_verify_error",
  "unexpected_settle_error",
  "missing_scheme_context",
  ...ExactErrorReasons,
  ...DeferredErrorReasons,
] as const;

// x402PaymentRequirements
export const PaymentRequirementsSchema = z.discriminatedUnion("scheme", [
  ExactPaymentRequirementsSchema,
  DeferredPaymentRequirementsSchema,
]);
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;
export type PaymentRequirementsExtra = z.infer<typeof PaymentRequirementsSchema>["extra"];

// x402PaymentPayload
export const PaymentPayloadSchema = z.discriminatedUnion("scheme", [
  ExactPaymentPayloadSchema,
  DeferredPaymentPayloadSchema,
]);
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

// x402UnsignedPaymentPayload
export const UnsignedPaymentPayloadSchema = z.discriminatedUnion("scheme", [
  UnsignedExactPaymentPayloadSchema,
  UnsignedDeferredPaymentPayloadSchema,
]);
export type UnsignedPaymentPayload = z.infer<typeof UnsignedPaymentPayloadSchema>;

// x402 Resource Server Response
export const x402ResponseSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  error: z.enum(ErrorReasons).optional(),
  accepts: z.array(PaymentRequirementsSchema).optional(),
  payer: z.string().regex(MixedAddressRegex).optional(),
});
export type x402Response = z.infer<typeof x402ResponseSchema>;

// x402RequestStructure
const HTTPVerbsSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]);
export type HTTPVerbs = z.infer<typeof HTTPVerbsSchema>;

export const HTTPRequestStructureSchema = z.object({
  type: z.literal("http"),
  method: HTTPVerbsSchema,
  queryParams: z.record(z.string(), z.string()).optional(),
  bodyType: z.enum(["json", "form-data", "multipart-form-data", "text", "binary"]).optional(),
  bodyFields: z.record(z.string(), z.any()).optional(),
  headerFields: z.record(z.string(), z.any()).optional(),
});

// export const MCPRequestStructureSchema = z.object({
//   type: z.literal("mcp"),
//   sessionIsPayed: z.boolean(),
//   payedAction: z.object({
//     kind: z.enum(["prompts", "resources", "tools"]),
//     name: z.string(),
//   }).optional(),
// });

// export const OpenAPIRequestStructureSchema = z.object({
//   type: z.literal("openapi"),
//   openApiUrl: z.string().url(),
//   path: z.string(),
// });

export const RequestStructureSchema = z.discriminatedUnion("type", [
  HTTPRequestStructureSchema,
  // MCPRequestStructureSchema,
  // OpenAPIRequestStructureSchema,
]);

export type HTTPRequestStructure = z.infer<typeof HTTPRequestStructureSchema>;
// export type MCPRequestStructure = z.infer<typeof MCPRequestStructureSchema>;
// export type OpenAPIRequestStructure = z.infer<typeof OpenAPIRequestStructureSchema>;
export type RequestStructure = z.infer<typeof RequestStructureSchema>;

// x402DiscoveryResource
export const DiscoveredResourceSchema = z.object({
  resource: z.string(),
  type: z.enum(["http"]),
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  accepts: z.array(PaymentRequirementsSchema),
  lastUpdated: z.date(),
  metadata: z.record(z.any()).optional(),
});
export type DiscoveredResource = z.infer<typeof DiscoveredResourceSchema>;

// x402SettleRequest
export const SettleRequestSchema = z.object({
  paymentPayload: PaymentPayloadSchema,
  paymentRequirements: PaymentRequirementsSchema,
});
export type SettleRequest = z.infer<typeof SettleRequestSchema>;

// x402VerifyRequest
export const VerifyRequestSchema = z.object({
  paymentPayload: PaymentPayloadSchema,
  paymentRequirements: PaymentRequirementsSchema,
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
// x402Request
export const X402RequestSchema = z.object({
  paymentRequirements: PaymentRequirementsSchema,
  paymentPayload: PaymentPayloadSchema,
});
export type X402Request = z.infer<typeof X402RequestSchema>;

// x402VerifyResponse
export const VerifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.enum(ErrorReasons).optional(),
  payer: EvmOrSvmAddress.optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

// x402SettleResponse
export const SettleResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.enum(ErrorReasons).optional(),
  payer: EvmOrSvmAddress.optional(),
  transaction: z.string().regex(MixedAddressRegex),
  network: NetworkSchema.optional(),
});
export type SettleResponse = z.infer<typeof SettleResponseSchema>;

// x402DiscoverListRequest
export const ListDiscoveryResourcesRequestSchema = z.object({
  type: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type ListDiscoveryResourcesRequest = z.infer<typeof ListDiscoveryResourcesRequestSchema>;

// x402ListDiscoveryResourcesResponse
export const ListDiscoveryResourcesResponseSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  items: z.array(DiscoveredResourceSchema),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});
export type ListDiscoveryResourcesResponse = z.infer<typeof ListDiscoveryResourcesResponseSchema>;

// x402SupportedPaymentKind
export const SupportedPaymentKindSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  scheme: z.enum(X402_SCHEMES),
  network: NetworkSchema,
  extra: z.record(z.any()).optional(),
});
export type SupportedPaymentKind = z.infer<typeof SupportedPaymentKindSchema>;

// x402SupportedPaymentKindsResponse
export const SupportedPaymentKindsResponseSchema = z.object({
  kinds: z.array(SupportedPaymentKindSchema),
});
export type SupportedPaymentKindsResponse = z.infer<typeof SupportedPaymentKindsResponseSchema>;

// x402SchemeContext
export const SchemeContextSchema = z.object({
  deferred: DeferredSchemeContextSchema.optional(),
});
export type SchemeContext = z.infer<typeof SchemeContextSchema>;
