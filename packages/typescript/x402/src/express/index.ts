import { Request, Response, NextFunction } from "express";
import {
  Money,
  moneySchema,
  PaymentDetails,
  toJsonSafe,
  settleResponseHeader,
  Resource,
} from "../types";
import { Address } from "viem";
import { getUsdcAddressForChain } from "../shared/evm/usdc";
import { useFacilitator } from "../client";
import { getPaywallHtml } from "../shared/paywall";
export { getPaywallHtml } from "./paywall";

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
  }: PaymentMiddlewareOptions = {}
) {
  const parsedAmount = moneySchema.safeParse(amount);
  if (!parsedAmount.success) {
    throw new Error(
      `Invalid amount (amount: ${amount}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`
    );
  }

  const { verify, settle } = useFacilitator(facilitatorUrl);

  // Express middleware
  return async (req: Request, res: Response, next: NextFunction) => {
    // Use req.originalUrl as the resource if none is provided
    const resourceUrl: Resource = resource || (req.originalUrl as Resource);
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

    console.log("Payment middleware checking request:", req.originalUrl);
    console.log("Payment details:", paymentDetails);

    const payment = req.header("X-PAYMENT");
    const userAgent = req.header("User-Agent") || "";
    const acceptHeader = req.header("Accept") || "";
    const isWebBrowser =
      acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      console.log("No payment header found, returning 402");
      if (isWebBrowser) {
        const html =
          customPaywallHtml ||
          getPaywallHtml({
            amount: parsedAmount.data,
            paymentDetails: toJsonSafe(paymentDetails),
            currentUrl: req.originalUrl,
            testnet,
          });
        return res.status(402).send(html);
      }
      return res.status(402).json({
        error: "X-PAYMENT header is required",
        paymentDetails: toJsonSafe(paymentDetails),
      });
    }

    try {
      const response = await verify(payment, paymentDetails);
      if (!response.isValid) {
        console.log("Invalid payment:", response.invalidReason);
        return res.status(402).json({
          error: response.invalidReason,
          paymentDetails: toJsonSafe(paymentDetails),
        });
      }
    } catch (error) {
      console.log("Error during payment verification:", error);
      return res.status(402).json({
        error,
        paymentDetails: toJsonSafe(paymentDetails),
      });
    }

    console.log("Payment verified, proceeding to next middleware or route handler");
    // Proceed to the next middleware or route handler
    await next();

    try {
      const settleResponse = await settle(payment, paymentDetails);
      const responseHeader = settleResponseHeader(settleResponse);
      res.setHeader("X-PAYMENT-RESPONSE", responseHeader);
    } catch (error) {
      console.log("Settlement failed:", error);
      // If settlement fails and the response hasn't been sent yet, return an error
      if (!res.headersSent) {
        return res.status(402).json({
          error,
          paymentDetails: toJsonSafe(paymentDetails),
        });
      }
    }
  };
}
