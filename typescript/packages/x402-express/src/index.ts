import type { Request, Response, NextFunction } from "express";
import { useFacilitator } from "x402/verify";
import { getNetworkId, getPaywallHtml, toJsonSafe } from "x402/shared";
import { exact } from "x402/schemes";
import { getUsdcAddressForChain } from "x402/shared/evm";
import {
  Money,
  Resource,
  GlobalConfig,
  PaymentMiddlewareConfig,
  moneySchema,
  PaymentRequirements,
  settleResponseHeader,
  PaymentPayload,
} from "x402/types";

/**
 * Enables APIs to be paid for using the x402 payment protocol.
 *
 * This middleware:
 * 1. Validates payment headers and requirements
 * 2. Serves a paywall page for browser requests
 * 3. Returns JSON payment requirements for API requests
 * 4. Verifies and settles payments
 * 5. Sets appropriate response headers
 * 6. Handles response streaming by intercepting the end() method
 *
 * @param globalConfig - Global configuration for the payment middleware
 * @param globalConfig.facilitatorUrl - URL of the payment facilitator service
 * @param globalConfig.address - Address to receive payments
 * @param globalConfig.network - Network identifier (e.g. 'base-sepolia')
 * @param globalConfig.createAuthHeaders - Function to create creates for the payment facilitator service.
 *
 * @returns A function that creates an Express middleware handler for a specific payment amount
 *
 * @example
 * ```typescript
 * const middleware = configurePaymentMiddleware({
 *   facilitatorUrl: 'https://facilitator.example.com',
 *   address: '0x123...',
 *   network: 'base-sepolia'
 * })(1.0, {
 *   description: 'Access to premium content',
 *   mimeType: 'application/json'
 * });
 *
 * app.use('/premium', middleware);
 * ```
 */
export function configurePaymentMiddleware(globalConfig: GlobalConfig) {
  const { facilitatorUrl, address, network, createAuthHeaders } = globalConfig;
  const { verify, settle } = useFacilitator(facilitatorUrl, createAuthHeaders);

  return function paymentMiddleware(amount: Money, config: PaymentMiddlewareConfig = {}) {
    const { description, mimeType, maxTimeoutSeconds, outputSchema, customPaywallHtml, resource } =
      config;

    const asset = config.asset ?? {
      address: getUsdcAddressForChain(getNetworkId(network)),
      decimals: 6,
      eip712: {
        name: "USDC",
        version: "2",
      },
    };

    const parsedAmount = moneySchema.safeParse(amount);
    if (!parsedAmount.success) {
      throw new Error(
        `Invalid amount (amount: ${amount}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`,
      );
    }
    const parsedUsdAmount = parsedAmount.data;
    const maxAmountRequired = parsedUsdAmount * 10 ** asset.decimals;

    // Express middleware
    return async (req: Request, res: Response, next: NextFunction) => {
      // Use req.originalUrl as the resource if none is provided
      // TODO: req.originalUrl is not always correct, and can just be the route, i.e. `/route`. Need to consider a better fallback.
      const resourceUrl: Resource = resource || (req.originalUrl as Resource);
      const paymentRequirements: PaymentRequirements[] = [
        {
          scheme: "exact",
          network,
          maxAmountRequired: maxAmountRequired.toString(),
          resource: resourceUrl,
          description: description ?? "",
          mimeType: mimeType ?? "",
          payTo: address,
          maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
          asset: asset.address,
          outputSchema: outputSchema ?? undefined,
          extra: {
            name: asset.eip712.name,
            version: asset.eip712.version,
          },
        },
      ];

      const payment = req.header("X-PAYMENT");
      const userAgent = req.header("User-Agent") || "";
      const acceptHeader = req.header("Accept") || "";
      const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

      if (!payment) {
        if (isWebBrowser) {
          const html =
            customPaywallHtml ||
            getPaywallHtml({
              amount: parsedAmount.data,
              paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
                typeof getPaywallHtml
              >[0]["paymentRequirements"],
              currentUrl: req.originalUrl,
              testnet: network === "base-sepolia",
            });
          return res.status(402).send(html);
        }
        return res.status(402).json({
          error: "X-PAYMENT header is required",
          paymentRequirements: toJsonSafe(paymentRequirements),
        });
      }

      let decodedPayment: PaymentPayload;
      try {
        decodedPayment = exact.evm.decodePayment(payment);
      } catch (error) {
        return res.status(402).json({
          error: error || "Invalid or malformed payment header",
          paymentRequirements: toJsonSafe(paymentRequirements),
        });
      }

      const selectedPaymentRequirements = paymentRequirements.find(
        value => value.scheme === decodedPayment.scheme && value.network === decodedPayment.network,
      );
      if (!selectedPaymentRequirements) {
        return res.status(402).json({
          error: "Unable to find matching payment requirements",
          paymentRequirements: toJsonSafe(paymentRequirements),
        });
      }

      try {
        const response = await verify(decodedPayment, selectedPaymentRequirements);
        if (!response.isValid) {
          return res.status(402).json({
            error: response.invalidReason,
            paymentRequirements: toJsonSafe(paymentRequirements),
            payerAddress: response.payerAddress,
          });
        }
      } catch (error) {
        return res.status(402).json({
          error,
          paymentRequirements: toJsonSafe(paymentRequirements),
        });
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      type EndArgs =
        | [cb?: () => void]
        | [chunk: any, cb?: () => void]
        | [chunk: any, encoding: BufferEncoding, cb?: () => void];
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const originalEnd = res.end.bind(res);
      let endArgs: EndArgs | null = null;

      res.end = function (...args: EndArgs) {
        endArgs = args;
        return res; // maintain correct return type
      };

      // Proceed to the next middleware or route handler
      await next();

      try {
        const settleResponse = await settle(decodedPayment, selectedPaymentRequirements);
        const responseHeader = settleResponseHeader(settleResponse);
        res.setHeader("X-PAYMENT-RESPONSE", responseHeader);
      } catch (error) {
        // If settlement fails and the response hasn't been sent yet, return an error
        if (!res.headersSent) {
          return res.status(402).json({
            error,
            paymentRequirements: toJsonSafe(paymentRequirements),
          });
        }
      } finally {
        res.end = originalEnd;
        if (endArgs) {
          originalEnd(...(endArgs as Parameters<typeof res.end>));
        }
      }
    };
  };
}

export type { Resource, Network, GlobalConfig, PaymentMiddlewareConfig, Money } from "x402/types";
