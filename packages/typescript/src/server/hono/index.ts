import type { Context, Next, MiddlewareHandler } from "hono";
import {
  Money,
  moneySchema,
  PaymentNeededDetails,
  PaymentPayloadV1,
} from "../../shared/types";
import { Address } from "viem";
import { getUsdcAddressForChain } from "../../shared/evm/usdc";
import { requestSettle, requestVerify } from "..";
import { decodePayment } from "../../client/exact/evm/sign";
import { paymentNeededDetailsToJsonSafe } from "../../shared/types/convert";

export function paymentMiddleware(
  amount: Money,
  address: Address,
  description: string = "",
  mimeType: string = "",
  maxDeadlineSeconds: number = 60,
  outputSchema: object | null = null,
  testnet: boolean = true // TODO: default this to false when we're not testing
): MiddlewareHandler {
  const parsedAmount = moneySchema.safeParse(amount);
  if (!parsedAmount.success) {
    throw new Error(
      `Invalid amount (amount: ${amount}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`
    );
  }

  const paymentDetails: PaymentNeededDetails = {
    version: 1,
    maxAmountRequired: BigInt(parsedAmount.data * 10 ** 6),
    resource: "http://localhost:4021/joke", // TODO: make this dynamic
    description,
    mimeType,
    resourceAddress: address,
    requiredDeadlineSeconds: maxDeadlineSeconds,
    usdcAddress: getUsdcAddressForChain(testnet ? 84532 : 8453),
    chainId: testnet ? 84532 : 1,
    outputSchema,
  };
  return async (c, next) => {
    const payment = c.req.header("X-PAYMENT");
    if (!payment) {
      return Response.json(
        {
          error: "X-PAYMENT header is required",
          paymentDetails: paymentNeededDetailsToJsonSafe(paymentDetails),
        },
        { status: 402 }
      );
    }

    const response = await requestVerify(payment, paymentDetails);
    if (!response.isValid) {
      return Response.json(
        {
          error: response.invalidReason,
          paymentDetails: paymentNeededDetailsToJsonSafe(paymentDetails),
        },
        { status: 402 }
      );
    }

    await next();

    const settle = await requestSettle(payment, paymentDetails);
    if (!settle.success) {
      return Response.json(
        {
          error: settle.error,
          paymentDetails: paymentNeededDetailsToJsonSafe(paymentDetails),
        },
        { status: 402 }
      );
    }
  };
}
