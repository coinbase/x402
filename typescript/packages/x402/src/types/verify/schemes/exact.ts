import { z } from "zod";
import {
  EvmAddressRegex,
  EvmSignatureRegex,
  HexEncoded64ByteRegex,
  EvmMaxAtomicUnits,
  SvmAddressRegex,
} from "../constants";
import { hasMaxLength, isInteger } from "../refiners";
import { Base64EncodedRegex } from "../../../shared";
import { BasePaymentPayloadSchema, BasePaymentRequirementsSchema } from "./base";

export const EXACT_SCHEME = "exact";

export const ExactErrorReasons = [
  "invalid_exact_evm_payload_authorization_valid_after",
  "invalid_exact_evm_payload_authorization_valid_before",
  "invalid_exact_evm_payload_authorization_value",
  "invalid_exact_evm_payload_signature",
  "invalid_exact_evm_payload_recipient_mismatch",
  "invalid_exact_evm_payload_from_mismatch",
  "invalid_exact_evm_payload_to_mismatch",
  "invalid_exact_evm_payload_value_mismatch",
  "invalid_exact_evm_payload_valid_after_mismatch",
  "invalid_exact_evm_payload_valid_before_mismatch",
  "invalid_exact_evm_payload_nonce_mismatch",
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
  "invalid_exact_svm_payload_transaction_cannot_derive_receiver_ata",
  "invalid_exact_svm_payload_transaction_receiver_ata_not_found",
  "invalid_exact_svm_payload_transaction_sender_ata_not_found",
  "invalid_exact_svm_payload_transaction_simulation_failed",
  "invalid_exact_svm_payload_transaction_transfer_to_incorrect_ata",
  "settle_exact_svm_block_height_exceeded",
  "settle_exact_svm_transaction_confirmation_timed_out",
] as const;

// x402ExactEvmPayloadAuthorization
export const ExactEvmPayloadAuthorizationSchema = z.object({
  from: z.string().regex(EvmAddressRegex),
  to: z.string().regex(EvmAddressRegex),
  value: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
  validAfter: z.string().refine(isInteger),
  validBefore: z.string().refine(isInteger),
  nonce: z.string().regex(HexEncoded64ByteRegex),
});
export type ExactEvmPayloadAuthorization = z.infer<typeof ExactEvmPayloadAuthorizationSchema>;

// x402ExactEvmPayload
export const ExactEvmPayloadSchema = z.object({
  signature: z.string().regex(EvmSignatureRegex),
  authorization: ExactEvmPayloadAuthorizationSchema,
});
export type ExactEvmPayload = z.infer<typeof ExactEvmPayloadSchema>;

// x402ExactSvmPayload
export const ExactSvmPayloadSchema = z.object({
  transaction: z.string().regex(Base64EncodedRegex),
});
export type ExactSvmPayload = z.infer<typeof ExactSvmPayloadSchema>;

// x402ExactPaymentPayload
export const ExactPaymentPayloadSchema = BasePaymentPayloadSchema.extend({
  scheme: z.literal(EXACT_SCHEME),
  payload: z.union([ExactEvmPayloadSchema, ExactSvmPayloadSchema]),
});
export type ExactPaymentPayload = z.infer<typeof ExactPaymentPayloadSchema>;

// x402UnsignedPaymentPayload
export const UnsignedExactPaymentPayloadSchema = BasePaymentPayloadSchema.extend({
  scheme: z.literal(EXACT_SCHEME),
  payload: ExactEvmPayloadSchema.omit({ signature: true }).extend({
    signature: z.undefined(),
  }),
});
export type UnsignedExactPaymentPayload = z.infer<typeof UnsignedExactPaymentPayloadSchema>;

// x402ExactPaymentRequirements
export const ExactPaymentRequirementsSchema = BasePaymentRequirementsSchema.extend({
  scheme: z.literal(EXACT_SCHEME),
  extra: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
      feePayer: z.string().regex(SvmAddressRegex).optional(),
    })
    .optional(),
});
export type ExactPaymentRequirements = z.infer<typeof ExactPaymentRequirementsSchema>;
