import type { Context } from "hono";
import { Address } from "viem";
import { exact } from "x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  getPaywallHtml,
  processPriceToAtomicAmount,
  toJsonSafe,
} from "x402/shared";
import {
  FacilitatorConfig,
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  Resource,
  RoutesConfig,
} from "x402/types";
import { useFacilitator } from "x402/verify";

/**
 * Enables APIs to be paid for using the x402 payment protocol.
 *
 * This middleware:
 * 1. Validates payment headers and requirements
 * 2. Serves a paywall page for browser requests
 * 3. Returns JSON payment requirements for API requests
 * 4. Verifies and settles payments
 * 5. Sets appropriate response headers
 *
 * @param payTo - Address to receive payments
 * @param routes - Route configuration for payment amounts
 * @param facilitator - Configuration for the payment facilitator service
 *
 * @returns A function that creates a Hono middleware handler for a specific payment amount
 *
 * @example
 * ```typescript
 * const middleware = paymentMiddleware(
 *   '0x123...',
 *   {
 *     '/premium/*': {
 *       price: '$0.01',
 *       network: 'base'
 *     }
 *   },
 *   {
 *     url: 'https://facilitator.example.com',
 *     createAuthHeaders: async () => ({
 *       verify: { "Authorization": "Bearer token" },
 *       settle: { "Authorization": "Bearer token" }
 *     })
 *   }
 * );
 *
 * app.use('/premium', middleware);
 * ```
 */
export function paymentMiddleware(
  payTo: Address,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
) {
  const { verify, settle } = useFacilitator(facilitator);
  const x402Version = 1;

  // Pre-compile route patterns to regex and extract verbs
  const routePatterns = computeRoutePatterns(routes);

  return async function paymentMiddleware(c: Context, next: () => Promise<void>) {
    const matchingRoute = findMatchingRoute(routePatterns, c.req.path, c.req.method.toUpperCase());
    if (!matchingRoute) {
      return next();
    }

    const { price, network } = matchingRoute.config;
    const { description, mimeType, maxTimeoutSeconds, outputSchema, customPaywallHtml, resource } =
      matchingRoute.config.config || {};

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl: Resource = resource || (c.req.url as Resource);

    const paymentRequirements: PaymentRequirements[] = [
      {
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "application/json",
        payTo,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
        asset: asset?.address ?? "",
        outputSchema,
        extra: asset?.eip712,
      },
    ];

    const payment = c.req.header("X-PAYMENT");
    const userAgent = c.req.header("User-Agent") || "";
    const acceptHeader = c.req.header("Accept") || "";
    const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      if (isWebBrowser) {
        let displayAmount: number;
        if (typeof price === "string" || typeof price === "number") {
          const parsed = moneySchema.safeParse(price);
          if (parsed.success) {
            displayAmount = parsed.data;
          } else {
            displayAmount = Number.NaN;
          }
        } else {
          displayAmount = Number(price.amount) / 10 ** price.asset.decimals;
        }

        const currentUrl = new URL(c.req.url).pathname + new URL(c.req.url).search;
        const html =
          customPaywallHtml ??
          getPaywallHtml({
            amount: displayAmount,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl,
            testnet: network === "base-sepolia",
          });
        return c.html(html, 402);
      }
      return c.json(
        {
          error: "X-PAYMENT header is required",
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }

    // Verify payment
    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(payment);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error : new Error("Invalid or malformed payment header"),
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }

    const selectedPaymentRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment,
    );
    if (!selectedPaymentRequirements) {
      return c.json(
        {
          error: "Unable to find matching payment requirements",
          accepts: toJsonSafe(paymentRequirements),
          x402Version,
        },
        402,
      );
    }

    const verification = await verify(decodedPayment, selectedPaymentRequirements);

    if (!verification.isValid) {
      return c.json(
        {
          error: new Error(verification.invalidReason),
          accepts: paymentRequirements,
          payer: verification.payer,
          x402Version,
        },
        402,
      );
    }

    // Proceed with request
    await next();

    // Settle payment after response
    try {
      const settlement = await settle(decodedPayment, paymentRequirements[0]);

      if (settlement.success) {
        c.header(
          "X-PAYMENT-RESPONSE",
          JSON.stringify({
            success: true,
            transaction: settlement.transaction,
            network: settlement.network,
          }),
        );
      }
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error : new Error("Failed to settle payment"),
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }
  };
}

export type {
  Money,
  Network,
  PaymentMiddlewareConfig,
  Resource,
  RouteConfig,
  RoutesConfig,
} from "x402/types";
