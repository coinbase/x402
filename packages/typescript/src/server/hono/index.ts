import type { MiddlewareHandler } from "hono";
import {
  Money,
  moneySchema,
  PaymentDetails,
  toJsonSafe,
  settleResponseHeader,
} from "../../types";
import { Address } from "viem";
import { getUsdcAddressForChain } from "../../shared/evm/usdc";
import { useFacilitator } from "../../client";

interface PaymentMiddlewareOptions {
  description?: string;
  mimeType?: string;
  maxDeadlineSeconds?: number;
  outputSchema?: object | null;
  facilitatorUrl?: string;
  testnet?: boolean;
}

export function paymentMiddleware(
  amount: Money,
  address: Address,
  {
    description = "",
    mimeType = "",
    maxDeadlineSeconds = 60,
    outputSchema = null,
    facilitatorUrl = "http://localhost:4020",
    testnet = true,
  }: PaymentMiddlewareOptions
): MiddlewareHandler {
  const parsedAmount = moneySchema.safeParse(amount);
  if (!parsedAmount.success) {
    throw new Error(
      `Invalid amount (amount: ${amount}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`
    );
  }

  const paymentDetails: PaymentDetails = {
    scheme: "exact",
    networkId: testnet ? "84532" : "8453",
    maxAmountRequired: BigInt(parsedAmount.data * 10 ** 6),
    resource: "http://localhost:4021/joke", // TODO: make this dynamic
    description,
    mimeType,
    payToAddress: address,
    requiredDeadlineSeconds: maxDeadlineSeconds,
    usdcAddress: getUsdcAddressForChain(testnet ? 84532 : 8453),
    outputSchema,
    extra: null,
  };

  const { verify, settle } = useFacilitator(facilitatorUrl);

  return async (c, next) => {
    const payment = c.req.header("X-PAYMENT");
    if (!payment) {
      c.res = Response.json(
        {
          error: "X-PAYMENT header is required",
          paymentDetails: toJsonSafe(paymentDetails),
        },
        { status: 402 }
      );
      return;
    }

    const response = await verify(payment, paymentDetails);
    if (!response.isValid) {
      c.res = Response.json(
        {
          error: response.invalidReason,
          paymentDetails: toJsonSafe(paymentDetails),
        },
        { status: 402 }
      );
      return;
    }

    await next();

    const settleResponse = await settle(payment, paymentDetails);
    if (!settleResponse.success) {
      c.res = Response.json(
        {
          error: settleResponse.error,
          paymentDetails: toJsonSafe(paymentDetails),
        },
        { status: 402 }
      );
      return;
    }

    const responseHeader = settleResponseHeader(settleResponse);
    c.header("X-PAYMENT-RESPONSE", responseHeader);
  };
}
