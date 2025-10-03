import { z } from "zod";
import { x402Versions } from "../versions";
import { NetworkSchema } from "../../shared/network";
import { isInteger } from "../refiners";
import { EvmAddressRegex, MixedAddressRegex } from "../constants";
import { SvmAddressRegex } from "../../shared/svm";

export const EvmOrSvmAddress = z
  .string()
  .regex(EvmAddressRegex)
  .or(z.string().regex(SvmAddressRegex));
export const MixedAddressOrSvmAddress = z
  .string()
  .regex(MixedAddressRegex)
  .or(z.string().regex(SvmAddressRegex));

export const BasePaymentPayloadSchema = z.object({
  x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
  network: NetworkSchema,
});

export const BasePaymentRequirementsSchema = z.object({
  network: NetworkSchema,
  maxAmountRequired: z.string().refine(isInteger),
  resource: z.string().url(),
  description: z.string(),
  mimeType: z.string(),
  outputSchema: z.record(z.any()).optional(),
  payTo: EvmOrSvmAddress,
  maxTimeoutSeconds: z.number().int(),
  asset: MixedAddressOrSvmAddress,
});
