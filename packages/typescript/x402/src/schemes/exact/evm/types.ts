/**
 * Types to implement the `exact` schema on EVM chains leveraging EIP-3009
 */

import { z } from "zod";
import { Address, Hex } from "viem";
import { makePaymentPayloadSchema } from "../../../types/index.js";

export type AuthorizationSignature = Hex;

export const authorizationSchema = z.object({
  from: z.custom<Address>(),
  to: z.custom<Address>(),
  value: z.bigint(),
  validAfter: z.bigint(),
  validBefore: z.bigint(),
  nonce: z.custom<Hex>(),
  version: z.string(),
});

export type AuthorizationParameters = z.infer<typeof authorizationSchema>;

const payloadSchema = z.object({
  signature: z.custom<AuthorizationSignature>(),
  authorization: authorizationSchema,
});

export type Payload = z.infer<typeof payloadSchema>;

export const paymentPayloadSchema = makePaymentPayloadSchema(payloadSchema);

export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;
