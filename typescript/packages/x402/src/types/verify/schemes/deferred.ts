import { z } from "zod";
import {
  EvmAddressRegex,
  EvmSignatureRegex,
  HexEncoded64ByteRegex,
  EvmMaxAtomicUnits,
  EvmTransactionHashRegex,
} from "../constants";
import { hasMaxLength, isBigInt, isInteger } from "../refiners";
import { BasePaymentPayloadSchema, BasePaymentRequirementsSchema } from "./base";
import { VoucherStore } from "../../../schemes/deferred/evm/store";
import { NetworkSchema } from "../../shared/network";

export const DEFERRRED_SCHEME = "deferred";

export const DeferredErrorReasons = [
  "invalid_deferred_evm_payload_scheme",
  "invalid_deferred_evm_requirements_scheme",
  "invalid_deferred_evm_payload_network_mismatch",
  "invalid_deferred_evm_payload_chain_id",
  "invalid_deferred_evm_payload_voucher_value",
  "invalid_deferred_evm_payload_recipient_mismatch",
  "invalid_deferred_evm_payload_asset_mismatch",
  "invalid_deferred_evm_payload_signature",
  "invalid_deferred_evm_payload_no_longer_valid",
  "invalid_deferred_evm_payload_voucher_expired",
  "invalid_deferred_evm_payload_timestamp_too_early",
  "invalid_deferred_evm_payload_voucher_non_zero_nonce",
  "invalid_deferred_evm_payload_voucher_id_mismatch",
  "invalid_deferred_evm_payload_voucher_buyer_mismatch",
  "invalid_deferred_evm_payload_voucher_seller_mismatch",
  "invalid_deferred_evm_payload_voucher_asset_mismatch",
  "invalid_deferred_evm_payload_voucher_escrow_mismatch",
  "invalid_deferred_evm_payload_voucher_chain_id_mismatch",
  "invalid_deferred_evm_payload_voucher_nonce_mismatch",
  "invalid_deferred_evm_payload_voucher_value_aggregate_decreasing",
  "invalid_deferred_evm_payload_voucher_timestamp_decreasing",
  "invalid_deferred_evm_payload_voucher_expiry_decreasing",
  "invalid_deferred_evm_payload_voucher_zero_value_aggregate",
  "invalid_deferred_evm_payload_voucher_not_duplicate",
  "invalid_deferred_evm_payload_voucher_could_not_settle_store",
  "invalid_deferred_evm_payload_voucher_error_settling_store",
  "invalid_deferred_evm_payload_voucher_not_found",
  "invalid_deferred_evm_payload_voucher_found_not_duplicate",
  "invalid_deferred_evm_payload_permit_signature",
  "invalid_deferred_evm_payload_deposit_authorization_signature",
  "invalid_deferred_evm_payload_permit_continuity",
  "invalid_deferred_evm_payload_deposit_authorization_continuity",
  "invalid_deferred_evm_payload_permit_nonce_invalid",
  "invalid_deferred_evm_payload_deposit_authorization_nonce_invalid",
  "invalid_deferred_evm_payload_deposit_authorization_failed",
  "invalid_deferred_evm_payload_deposit_authorization_buyer_mismatch",
  "invalid_deferred_evm_payload_deposit_authorization_insufficient_allowance",
  "invalid_deferred_evm_payload_flush_authorization_signature",
  "invalid_deferred_evm_payload_flush_authorization_continuity",
  "invalid_deferred_evm_payload_flush_authorization_failed",
  "invalid_deferred_evm_contract_call_failed_verification_data",
] as const;

// x402DeferredEvmPayloadVoucher
export const DeferredEvmPayloadVoucherSchema = z.object({
  id: z.string().regex(HexEncoded64ByteRegex),
  buyer: z.string().regex(EvmAddressRegex),
  seller: z.string().regex(EvmAddressRegex),
  valueAggregate: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  asset: z.string().regex(EvmAddressRegex),
  timestamp: z.number().int().nonnegative(),
  nonce: z.number().int().nonnegative(),
  escrow: z.string().regex(EvmAddressRegex),
  chainId: z.number().int().nonnegative(),
  expiry: z.number().int().nonnegative(),
});
export type DeferredEvmPayloadVoucher = z.infer<typeof DeferredEvmPayloadVoucherSchema>;

// x402DeferredEvmPayloadSignedVoucher
export const DeferredEvmPayloadSignedVoucherSchema = DeferredEvmPayloadVoucherSchema.extend({
  signature: z.string().regex(EvmSignatureRegex),
});
export type DeferredEvmPayloadSignedVoucher = z.infer<typeof DeferredEvmPayloadSignedVoucherSchema>;

// x402DeferredVoucherCollection
export const DeferredVoucherCollectionSchema = z.object({
  voucherId: z.string().regex(HexEncoded64ByteRegex),
  voucherNonce: z.number().int().nonnegative(),
  transactionHash: z.string().regex(EvmTransactionHashRegex),
  collectedAmount: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  asset: z.string().regex(EvmAddressRegex),
  chainId: z.number().int().nonnegative(),
  collectedAt: z.number().int().nonnegative(),
});
export type DeferredVoucherCollection = z.infer<typeof DeferredVoucherCollectionSchema>;

// x402DeferredEscrowDepositAuthorizationPermit
export const DeferredEscrowDepositAuthorizationPermitSchema = z.object({
  owner: z.string().regex(EvmAddressRegex),
  spender: z.string().regex(EvmAddressRegex),
  value: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  nonce: z.string().refine(isBigInt),
  deadline: z.number().int().nonnegative(),
  domain: z.object({
    name: z.string(),
    version: z.string(),
  }),
});
export type DeferredEscrowDepositAuthorizationPermit = z.infer<
  typeof DeferredEscrowDepositAuthorizationPermitSchema
>;

// x402DeferredEscrowDepositAuthorizationSignedPermit
export const DeferredEscrowDepositAuthorizationSignedPermitSchema =
  DeferredEscrowDepositAuthorizationPermitSchema.extend({
    signature: z.string().regex(EvmSignatureRegex),
  });
export type DeferredEscrowDepositAuthorizationSignedPermit = z.infer<
  typeof DeferredEscrowDepositAuthorizationSignedPermitSchema
>;

// x402DeferredEscrowDepositAuthorizationInner
export const DeferredEscrowDepositAuthorizationInnerSchema = z.object({
  buyer: z.string().regex(EvmAddressRegex),
  seller: z.string().regex(EvmAddressRegex),
  asset: z.string().regex(EvmAddressRegex),
  amount: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  nonce: z.string().regex(HexEncoded64ByteRegex),
  expiry: z.number().int().nonnegative(),
});
export type DeferredEscrowDepositAuthorizationInner = z.infer<
  typeof DeferredEscrowDepositAuthorizationInnerSchema
>;

// x402DeferredEscrowDepositAuthorizationSignedInner
export const DeferredEscrowDepositAuthorizationSignedInnerSchema =
  DeferredEscrowDepositAuthorizationInnerSchema.extend({
    signature: z.string().regex(EvmSignatureRegex),
  });
export type DeferredEscrowDepositAuthorizationSignedInner = z.infer<
  typeof DeferredEscrowDepositAuthorizationSignedInnerSchema
>;

// x402DeferredEscrowDepositAuthorization
export const DeferredEscrowDepositAuthorizationSchema = z.object({
  permit: DeferredEscrowDepositAuthorizationSignedPermitSchema.optional(),
  depositAuthorization: DeferredEscrowDepositAuthorizationSignedInnerSchema,
});
export type DeferredEscrowDepositAuthorization = z.infer<
  typeof DeferredEscrowDepositAuthorizationSchema
>;

// x402DeferredEscrowFlushAuthorization
export const DeferredEscrowFlushAuthorizationSchema = z.object({
  buyer: z.string().regex(EvmAddressRegex),
  seller: z.string().regex(EvmAddressRegex).optional(),
  asset: z.string().regex(EvmAddressRegex).optional(),
  nonce: z.string().regex(HexEncoded64ByteRegex),
  expiry: z.number().int().nonnegative(),
});
export type DeferredEscrowFlushAuthorization = z.infer<
  typeof DeferredEscrowFlushAuthorizationSchema
>;

// x402DeferredEscrowFlushAuthorizationSigned
export const DeferredEscrowFlushAuthorizationSignedSchema =
  DeferredEscrowFlushAuthorizationSchema.extend({
    signature: z.string().regex(EvmSignatureRegex),
  });
export type DeferredEscrowFlushAuthorizationSigned = z.infer<
  typeof DeferredEscrowFlushAuthorizationSignedSchema
>;

// x402DeferredEscrowDepositAuthorizationConfig
export const DeferredEscrowDepositAuthorizationConfigSchema = z.object({
  asset: z.string().regex(EvmAddressRegex),
  assetDomain: z.object({
    name: z.string(),
    version: z.string(),
  }),
  threshold: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  amount: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
});
export type DeferredEscrowDepositAuthorizationConfig = z.infer<
  typeof DeferredEscrowDepositAuthorizationConfigSchema
>;

// x402DeferredEvmPayload
export const DeferredEvmPayloadSchema = z.object({
  signature: z.string().regex(EvmSignatureRegex),
  voucher: DeferredEvmPayloadVoucherSchema,
  depositAuthorization: DeferredEscrowDepositAuthorizationSchema.optional(),
});
export type DeferredEvmPayload = z.infer<typeof DeferredEvmPayloadSchema>;

// x402DeferredPaymentPayload
export const DeferredPaymentPayloadSchema = BasePaymentPayloadSchema.extend({
  scheme: z.literal(DEFERRRED_SCHEME),
  payload: DeferredEvmPayloadSchema,
});
export type DeferredPaymentPayload = z.infer<typeof DeferredPaymentPayloadSchema>;

// x402UnsignedDeferredPaymentPayload
export const UnsignedDeferredPaymentPayloadSchema = BasePaymentPayloadSchema.extend({
  scheme: z.literal(DEFERRRED_SCHEME),
  payload: DeferredEvmPayloadSchema.omit({ signature: true }).extend({
    signature: z.undefined(),
  }),
});
export type UnsignedDeferredPaymentPayload = z.infer<typeof UnsignedDeferredPaymentPayloadSchema>;

// x402DeferredEvmPaymentRequirementsExtraAccountBalance
export const DeferredEvmPaymentRequirementsExtraAccountDetailsSchema = z.object({
  balance: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  assetAllowance: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  assetPermitNonce: z.string().refine(isBigInt),
  facilitator: z.string(),
});
export type DeferredEvmPaymentRequirementsExtraAccountDetails = z.infer<
  typeof DeferredEvmPaymentRequirementsExtraAccountDetailsSchema
>;

// x402DeferredEvmPaymentRequirementsExtraNewVoucher
export const DeferredEvmPaymentRequirementsExtraNewVoucherSchema = z.object({
  type: z.literal("new"),
  account: DeferredEvmPaymentRequirementsExtraAccountDetailsSchema.optional(),
  voucher: DeferredEvmPayloadVoucherSchema.pick({ id: true, escrow: true }),
});
export type DeferredEvmPaymentRequirementsExtraNewVoucher = z.infer<
  typeof DeferredEvmPaymentRequirementsExtraNewVoucherSchema
>;

// x402DeferredEvmPaymentRequirementsExtraAggregationVoucher
export const DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema = z.object({
  type: z.literal("aggregation"),
  account: DeferredEvmPaymentRequirementsExtraAccountDetailsSchema.optional(),
  signature: z.string().regex(EvmSignatureRegex),
  voucher: DeferredEvmPayloadVoucherSchema,
});
export type DeferredEvmPaymentRequirementsExtraAggregationVoucher = z.infer<
  typeof DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema
>;

// x402DeferredPaymentRequirements
export const DeferredPaymentRequirementsSchema = BasePaymentRequirementsSchema.extend({
  scheme: z.literal(DEFERRRED_SCHEME),
  extra: z.discriminatedUnion("type", [
    DeferredEvmPaymentRequirementsExtraNewVoucherSchema,
    DeferredEvmPaymentRequirementsExtraAggregationVoucherSchema,
  ]),
});
export type DeferredPaymentRequirements = z.infer<typeof DeferredPaymentRequirementsSchema>;

// x402DeferredSchemeContext
export const DeferredSchemeContextSchema = z.object({
  voucherStore: z.instanceof(VoucherStore),
});
export type DeferredSchemeContext = z.infer<typeof DeferredSchemeContextSchema>;

// x402DeferredErrorResponse
export const DeferredErrorResponseSchema = z.object({
  error: z.string(),
  details: z.any().optional(),
});
export type DeferredErrorResponse = z.infer<typeof DeferredErrorResponseSchema>;

// x402DeferredVoucherResponse
export const DeferredVoucherResponseSchema = z.union([
  DeferredEvmPayloadSignedVoucherSchema,
  DeferredErrorResponseSchema,
]);
export type DeferredVoucherResponse = z.infer<typeof DeferredVoucherResponseSchema>;

// x402DeferredVouchersResponse
export const DeferredVouchersResponseSchema = z.union([
  z.object({
    data: z.array(DeferredEvmPayloadSignedVoucherSchema),
    count: z.number(),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
    }),
  }),
  DeferredErrorResponseSchema,
]);
export type DeferredVouchersResponse = z.infer<typeof DeferredVouchersResponseSchema>;

// x402DeferredVoucherCollectionResponse
export const DeferredVoucherCollectionResponseSchema = z.object({
  voucherId: z.string(),
  voucherNonce: z.number(),
  transactionHash: z.string().regex(EvmTransactionHashRegex),
  collectedAmount: z.string(),
  asset: z.string(),
  chainId: z.number(),
  timestamp: z.number(),
});
export type DeferredVoucherCollectionResponse = z.infer<
  typeof DeferredVoucherCollectionResponseSchema
>;

// x402DeferredVoucherCollectionsResponse
export const DeferredVoucherCollectionsResponseSchema = z.union([
  z.object({
    data: z.array(DeferredVoucherCollectionSchema),
    count: z.number(),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
    }),
  }),
  DeferredErrorResponseSchema,
]);
export type DeferredVoucherCollectionsResponse = z.infer<
  typeof DeferredVoucherCollectionsResponseSchema
>;

// x402DeferredDepositWithAuthorizationResponse
export const DeferredDepositWithAuthorizationResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  payer: z.string().regex(EvmAddressRegex).optional(),
  transaction: z.string().regex(EvmTransactionHashRegex),
  network: NetworkSchema.optional(),
});
export type DeferredDepositWithAuthorizationResponse = z.infer<
  typeof DeferredDepositWithAuthorizationResponseSchema
>;

// x402DeferredFlushWithAuthorizationResponse
export const DeferredFlushWithAuthorizationResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  payer: z.string().regex(EvmAddressRegex).optional(),
  transaction: z.string().regex(EvmTransactionHashRegex),
  network: NetworkSchema.optional(),
});
export type DeferredFlushWithAuthorizationResponse = z.infer<
  typeof DeferredFlushWithAuthorizationResponseSchema
>;

// x402DeferredAccountDetailsResponse
export const DeferredBuyerDataResponseSchema = z.object({
  balance: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  assetAllowance: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  assetPermitNonce: z.string().refine(isBigInt),
  voucher: DeferredEvmPayloadSignedVoucherSchema.optional(),
});
export type DeferredBuyerDataResponse = z.infer<typeof DeferredBuyerDataResponseSchema>;
