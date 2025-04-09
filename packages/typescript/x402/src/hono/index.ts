import type { MiddlewareHandler } from "hono";
import { Address } from "viem";
import {
  Money,
  moneySchema,
  PaymentDetails,
  toJsonSafe,
  settleResponseHeader,
  Resource,
} from "../types/index.js";
import { getUsdcAddressForChain } from "../shared/evm/usdc.js";
import { useFacilitator } from "../client.js";
import { getPaywallHtml } from "../shared/paywall.js";
export { getPaywallHtml } from "../shared/paywall.js"

interface PaymentMiddlewareOptions {
  description?: string;
  mimeType?: string;
  maxDeadlineSeconds?: number;
  outputSchema?: object | null;
  facilitatorUrl?: string;
  testnet?: boolean;
  customPaywallHtml?: string;
  resource?: Resource | null;
}

export function paymentMiddleware(
  amount: Money,
  address: Address,
  {
    description = "",
    mimeType = "",
    maxDeadlineSeconds = 60,
    outputSchema = null,
    facilitatorUrl = "https://x402.org/facilitator",
    testnet = true,
    customPaywallHtml = "",
    resource = null,
  }: PaymentMiddlewareOptions = {},
): MiddlewareHandler {
  const parsedAmount = moneySchema.safeParse(amount);
  if (!parsedAmount.success) {
    throw new Error(
      `Invalid amount (amount: ${amount}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`,
    );
  }

  const { verify, settle } = useFacilitator(facilitatorUrl);

  return async (c, next) => {
    let resourceUrl = resource || (c.req.url as Resource);
    const paymentDetails: PaymentDetails = {
      scheme: "exact",
      networkId: testnet ? "84532" : "8453",
      maxAmountRequired: BigInt(parsedAmount.data * 10 ** 6),
      resource: resourceUrl,
      description,
      mimeType,
      payToAddress: address,
      requiredDeadlineSeconds: maxDeadlineSeconds,
      usdcAddress: getUsdcAddressForChain(testnet ? 84532 : 8453),
      outputSchema,
      extra: null,
    };
    console.log("Payment middleware checking request:", c.req.url);
    console.log("Payment details:", paymentDetails);

    const payment = c.req.header("X-PAYMENT");
    const userAgent = c.req.header("User-Agent") || "";
    const acceptHeader = c.req.header("Accept") || "";
    const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      console.log("No payment header found, returning 402");
      // If it's a browser request, serve the paywall page
      if (isWebBrowser) {
        const html =
          customPaywallHtml ||
          getPaywallHtml({
            amount: parsedAmount.data,
            paymentDetails: toJsonSafe(paymentDetails),
            currentUrl: c.req.url,
            testnet,
          });

        return c.html(html, 402);
      }

      // For API requests, return JSON with payment details
      return c.json(
        {
          error: "X-PAYMENT header is required",
          paymentDetails: toJsonSafe(paymentDetails),
        },
        402,
      );
    }

    const response = await verify(payment, paymentDetails);
    if (!response.isValid) {
      console.log("Invalid payment:", response.invalidReason);
      return c.json(
        {
          error: response.invalidReason,
          paymentDetails: toJsonSafe(paymentDetails),
        },
        402,
      );
    }

    console.log("Payment verified, proceeding");
    await next();

    try {
      const settleResponse = await settle(payment, paymentDetails);
      const responseHeader = settleResponseHeader(settleResponse);

      c.header("X-PAYMENT-RESPONSE", responseHeader);
    } catch (error) {
      console.log("Settlement failed:", error);

      c.res = c.json(
        {
          error,
          paymentDetails: toJsonSafe(paymentDetails),
        },
        402,
      );
    }
  };
}
