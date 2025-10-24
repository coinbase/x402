import { z } from "zod";
import { NetworkSchema } from "../shared";
import { SvmAddressRegex } from "../shared/svm";
import { Base64EncodedRegex } from "../../shared/base64";

// Constants
// Maximum digits for token amounts in wei/atomic units
// This is a security measure to prevent DoS attacks with unreasonably large numbers
// Practical limit: Most tokens have supply < 10^30 (e.g., ETH ~10^26, USDC ~10^16)
// Setting to 40 allows up to 10^40, which is 10 trillion times the total ETH supply
// This is more than enough for any legitimate use case while preventing abuse
const EvmMaxAtomicUnits = 40;
const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
const MixedAddressRegex = /^0x[a-fA-F0-9]{40}|[A-Za-z0-9][A-Za-z0-9-]{0,34}[A-Za-z0-9]$/;
const HexEncoded64ByteRegex = /^0x[0-9a-fA-F]{64}$/;
const EvmSignatureRegex = /^0x[0-9a-fA-F]+$/; // Flexible hex signature validation
// Enums
export const schemes = ["exact"] as const;
export const x402Versions = [1] as const;
export const ErrorReasons = [
  "insufficient_funds",
  "invalid_exact_evm_payload_authorization_valid_after",
  "invalid_exact_evm_payload_authorization_valid_before",
  "invalid_exact_evm_payload_authorization_value",
  "invalid_exact_evm_payload_signature",
  "invalid_exact_evm_payload_recipient_mismatch",
  "invalid_exact_svm_payload_transaction",
  "invalid_exact_svm_payload_transaction_amount_mismatch",
  "invalid_exact_svm_payload_transaction_create_ata_instruction",
  "invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_payee",
  "invalid_exact_svm_payload_transaction_create_ata_instruction_incorrect_asset",
  "invalid_exact_svm_payload_transaction_instructions",
  "invalid_exact_svm_payload_transaction_instructions_length",
  "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
  "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
  "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
  "invalid_exact_svm_payload_transaction_instruction_not_spl_token_transfer_checked",
  "invalid_exact_svm_payload_transaction_instruction_not_token_2022_transfer_checked",
  "invalid_exact_svm_payload_transaction_not_a_transfer_instruction",
  "invalid_exact_svm_payload_transaction_receiver_ata_not_found",
  "invalid_exact_svm_payload_transaction_sender_ata_not_found",
  "invalid_exact_svm_payload_transaction_simulation_failed",
  "invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata",
  "invalid_network",
  "invalid_payload",
  "invalid_payment_requirements",
  "invalid_scheme",
  "invalid_payment",
  "payment_expired",
  "unsupported_scheme",
  "invalid_x402_version",
  "invalid_transaction_state",
  "settle_exact_svm_block_height_exceeded",
  "settle_exact_svm_transaction_confirmation_timed_out",
  "unexpected_settle_error",
  "unexpected_verify_error",
  // New error reasons for Permit and Permit2
  "unsupported_authorization_type",
  "invalid_authorization_type",
  "invalid_permit_signature",
  "invalid_permit2_signature",
  "permit_expired",
  "permit2_expired",
  "permit2_not_approved",
  "invalid_token_address",
  "invalid_spender_address",
  "token_mismatch",
  "insufficient_payment_amount",
  "transaction_failed",
  "settlement_failed",
] as const;

// Refiners
const isInteger: (value: string) => boolean = value =>
  Number.isInteger(Number(value)) && Number(value) >= 0;
const hasMaxLength = (maxLength: number) => (value: string) => value.length <= maxLength;

// x402PaymentRequirements
const EvmOrSvmAddress = z.string().regex(EvmAddressRegex).or(z.string().regex(SvmAddressRegex));
const mixedAddressOrSvmAddress = z
  .string()
  .regex(MixedAddressRegex)
  .or(z.string().regex(SvmAddressRegex));
export const PaymentRequirementsSchema = z.object({
  scheme: z.enum(schemes),
  network: NetworkSchema,
  maxAmountRequired: z.string().refine(isInteger),
  resource: z.string().url(),
  description: z.string(),
  mimeType: z.string(),
  outputSchema: z.record(z.any()).optional(),
  payTo: EvmOrSvmAddress,
  maxTimeoutSeconds: z.number().int(),
  asset: mixedAddressOrSvmAddress,
  extra: z.record(z.any()).optional(),
});
export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

// x402ExactEvmPayload - EIP-3009 (transferWithAuthorization)
export const ExactEvmPayloadAuthorizationSchema = z.object({
  from: z.string().regex(EvmAddressRegex),
  to: z.string().regex(EvmAddressRegex),
  value: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  validAfter: z.string().refine(isInteger),
  validBefore: z.string().refine(isInteger),
  nonce: z.string().regex(HexEncoded64ByteRegex),
});
export type ExactEvmPayloadAuthorization = z.infer<typeof ExactEvmPayloadAuthorizationSchema>;

// EIP-2612 Permit
export const PermitEvmPayloadAuthorizationSchema = z.object({
  owner: z.string().regex(EvmAddressRegex),
  spender: z.string().regex(EvmAddressRegex),
  value: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  deadline: z.string().refine(isInteger),
  nonce: z.string().refine(isInteger),
});
export type PermitEvmPayloadAuthorization = z.infer<typeof PermitEvmPayloadAuthorizationSchema>;

// Permit2
export const Permit2EvmPayloadAuthorizationSchema = z.object({
  owner: z.string().regex(EvmAddressRegex),
  spender: z.string().regex(EvmAddressRegex),
  token: z.string().regex(EvmAddressRegex),
  amount: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  deadline: z.string().refine(isInteger),
  nonce: z.string().refine(isInteger),
});
export type Permit2EvmPayloadAuthorization = z.infer<typeof Permit2EvmPayloadAuthorizationSchema>;

// Discriminated union for all EVM authorization types
export const ExactEvmPayloadSchema = z.discriminatedUnion("authorizationType", [
  z.object({
    authorizationType: z.literal("eip3009"),
    signature: z.string().regex(EvmSignatureRegex),
    authorization: ExactEvmPayloadAuthorizationSchema,
  }),
  z.object({
    authorizationType: z.literal("permit"),
    signature: z.string().regex(EvmSignatureRegex),
    authorization: PermitEvmPayloadAuthorizationSchema,
  }),
  z.object({
    authorizationType: z.literal("permit2"),
    signature: z.string().regex(EvmSignatureRegex),
    authorization: Permit2EvmPayloadAuthorizationSchema,
  }),
]);
export type ExactEvmPayload = z.infer<typeof ExactEvmPayloadSchema>;

// x402ExactSvmPayload
export const ExactSvmPayloadSchema = z.object({
  transaction: z.string().regex(Base64EncodedRegex),
});
export type ExactSvmPayload = z.infer<typeof ExactSvmPayloadSchema>;

// x402PaymentPayload
export const PaymentPayloadSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  scheme: z.enum(schemes),
  network: NetworkSchema,
  payload: z.union([ExactEvmPayloadSchema, ExactSvmPayloadSchema]),
});
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

// Protocol-specific payment payload types
export type EvmPaymentPayload<T extends "eip3009" | "permit" | "permit2"> = Omit<
  PaymentPayload,
  "payload"
> & {
  payload: {
    authorizationType: T;
    signature: `0x${string}`;
    authorization: T extends "eip3009"
    ? z.infer<typeof ExactEvmPayloadAuthorizationSchema>
    : T extends "permit"
    ? z.infer<typeof PermitEvmPayloadAuthorizationSchema>
    : z.infer<typeof Permit2EvmPayloadAuthorizationSchema>;
  };
};

// Unsigned EVM payment payload (core type definition)
export type UnsignedEvmPaymentPayload<T extends "eip3009" | "permit" | "permit2"> = Omit<
  PaymentPayload,
  "payload"
> & {
  payload: {
    authorizationType: T;
    signature: undefined;
    authorization: T extends "eip3009"
    ? z.infer<typeof ExactEvmPayloadAuthorizationSchema>
    : T extends "permit"
    ? Omit<z.infer<typeof PermitEvmPayloadAuthorizationSchema>, "nonce"> & { nonce?: string }
    : Omit<z.infer<typeof Permit2EvmPayloadAuthorizationSchema>, "nonce"> & { nonce?: string };
  };
};

// Specific type aliases (for convenience)
export type Eip3009PaymentPayload = EvmPaymentPayload<"eip3009">;
export type UnsignedEip3009PaymentPayload = UnsignedEvmPaymentPayload<"eip3009">;
export type PermitPaymentPayload = EvmPaymentPayload<"permit">;
export type UnsignedPermitPaymentPayload = UnsignedEvmPaymentPayload<"permit">;
export type Permit2PaymentPayload = EvmPaymentPayload<"permit2">;
export type UnsignedPermit2PaymentPayload = UnsignedEvmPaymentPayload<"permit2">;

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
  network: NetworkSchema,
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
  scheme: z.enum(schemes),
  network: NetworkSchema,
  extra: z.record(z.any()).optional(),
});
export type SupportedPaymentKind = z.infer<typeof SupportedPaymentKindSchema>;

// x402SupportedPaymentKindsResponse
export const SupportedPaymentKindsResponseSchema = z.object({
  kinds: z.array(SupportedPaymentKindSchema),
});
export type SupportedPaymentKindsResponse = z.infer<typeof SupportedPaymentKindsResponseSchema>;
