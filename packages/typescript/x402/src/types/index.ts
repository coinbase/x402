import { z } from "zod";
import { safeBase64Encode, safeBase64Decode } from "../shared/index.js";

export { SignerWallet } from "../shared/evm/wallet.js";

const resourceSchema = z.string().regex(/^[^:]+:\/\/.+$/) as z.ZodType<Resource>;

/** Payment Details */

export const paymentDetailsSchema = z.object({
  // Scheme of the payment protocol to use
  scheme: z.string(),
  // Network of the blockchain to send payment on
  networkId: z.string(),
  // Maximum amount required to pay for the resource as usdc dollars x 10**6
  maxAmountRequired: z.bigint({ coerce: true }),
  // URL of resource to pay for
  resource: resourceSchema,
  // Description of the resource
  description: z.string(),
  // mime type of the resource response
  mimeType: z.string(),
  // output schema of the resource
  outputSchema: z.object({}).nullable(),
  // address to pay value for access to the resource
  payToAddress: z.string(),
  // time in seconds it may before payment can be settled (how long the resource server needs to process the payment)
  requiredDeadlineSeconds: z.number(),
  // TODO: move usdc to be scheme specific so we can support many different tokens
  // address of the USDC contract
  usdcAddress: z.string(),
  // extra information about the payment details specific to the scheme
  extra: z.record(z.string(), z.any()).nullable(),
});

export type PaymentDetails = z.infer<typeof paymentDetailsSchema>;

/** end Payment Details */

/** Payment Required Response */

export const paymentRequiredSchema = z.object({
  // Version of the x402 payment protocol
  x402Version: z.number(),
  // List of payment details that the resource server accepts. A resource server may accept on multiple chains.
  accepts: z.array(paymentDetailsSchema),
  // Message from the resource server to the client to communicate errors in processing payment
  error: z.string().nullable(),
});

export type PaymentRequired = z.infer<typeof paymentRequiredSchema>;

/** end Payment Required Response */

/** Payment Payload */

export type PaymentPayload<T> = {
  // Version of the x402 payment protocol
  x402Version: number;
  // Scheme of the payment protocol to use
  scheme: string;
  // Network of the blockchain to send payment on
  networkId: string;
  // Payload of the payment protocol
  payload: T;
  // Resource to pay for
  resource: Resource;
};

export function makePaymentPayloadSchema<T>(payloadSchema: z.ZodSchema<T>) {
  return z.object({
    x402Version: z.number(),
    scheme: z.string(),
    networkId: z.string(),
    payload: payloadSchema,
    resource: resourceSchema,
  });
}

/** end Payment Payload */

/** Facilitator Types */

export const facilitatorRequestSchema = z.object({
  paymentHeader: z.string(),
  paymentDetails: paymentDetailsSchema,
});

export type FacilitatorRequest = z.infer<typeof facilitatorRequestSchema>;

export type SettleResponse = {
  success: boolean;
  error?: string | undefined;
  txHash?: string | undefined;
  networkId?: string | undefined;
};

export function settleResponseHeader(response: SettleResponse): string {
  return safeBase64Encode(JSON.stringify(response));
}

export function settleResponseFromHeader(header: string): SettleResponse {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded) as SettleResponse;
}

export type VerifyResponse = {
  isValid: boolean;
  invalidReason?: string | undefined;
};

/** end Facilitator Types */

/** Utility Types */

export const moneySchema = z
  .union([z.string().transform(x => x.replace(/[^0-9.-]+/g, "")), z.number()])
  .pipe(z.coerce.number().min(0.0001).max(999999999));

export type Money = z.input<typeof moneySchema>;

export type Resource = `${string}://${string}`;

/** end Utility Types */

export function toJsonSafe<T extends object>(data: T): object {
  if (typeof data !== "object") {
    throw new Error("Data is not an object");
  }

  function convert(value: unknown): unknown {
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, convert(val)]));
    }

    if (Array.isArray(value)) {
      return value.map(convert);
    }

    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  }

  return convert(data) as object;
}
