import type { Context } from "hono";
import type { Address } from "viem";
import type { FacilitatorConfig, RoutesConfig, PaywallConfig } from "x402/types";
import { exact } from "x402/schemes";
import { getPaywallHtml, toJsonSafe } from "x402/shared";
import { moneySchema, settleResponseHeader } from "x402/types";
import { useFacilitator } from "x402/verify";
import { PaymentMiddleware, X402Error } from "x402/middleware";

/**
 * Creates a payment middleware factory for Hono
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @param useFacilitatorFn - Optional useFacilitator function, used in dev/testing mode
 * @returns A Hono middleware handler
 *
 * @example
 * ```typescript
 * // Simple configuration - All endpoints are protected by $0.01 of USDC on base-sepolia
 * app.use(paymentMiddleware(
 *   '0x123...', // payTo address
 *   {
 *     price: '$0.01', // USDC amount in dollars
 *     network: 'base-sepolia'
 *   },
 *   // Optional facilitator configuration. Defaults to x402.org/facilitator for testnet usage
 * ));
 *
 * // Advanced configuration - Endpoint-specific payment requirements & custom facilitator
 * app.use(paymentMiddleware('0x123...', // payTo: The address to receive payments
 *   {
 *     '/weather/*': {
 *       price: '$0.001', // USDC amount in dollars
 *       network: 'base',
 *       config: {
 *         description: 'Access to weather data'
 *       }
 *     }
 *   },
 *   {
 *     url: 'https://facilitator.example.com',
 *     createAuthHeaders: async () => ({
 *       verify: { "Authorization": "Bearer token" },
 *       settle: { "Authorization": "Bearer token" }
 *     })
 *   },
 *   {
 *     cdpClientKey: 'your-cdp-client-key',
 *     appLogo: '/images/logo.svg',
 *     appName: 'My App',
 *   }
 * ));
 * ```
 */
export function paymentMiddleware(
  payTo: Address,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
  useFacilitatorFn: typeof useFacilitator = useFacilitator,
) {
  const middlewares = PaymentMiddleware.forRoutes<Context>(
    payTo,
    routes,
    function paymentFromRequest(ctx) {
      const paymentHeader = ctx.req.header("X-Payment");
      if (!paymentHeader) {
        return undefined;
      }
      return exact.evm.decodePayment(paymentHeader);
    },
    function canRenderPaywall(ctx) {
      const userAgent = ctx.req.header("User-Agent") || "";
      const acceptHeader = ctx.req.header("Accept") || "";
      return acceptHeader.includes("text/html") && userAgent.includes("Mozilla");
    },
    facilitator,
    paywall,
    useFacilitatorFn,
  );

  return async function paymentMiddleware(c: Context, next: () => Promise<void>) {
    const x402Middleware = middlewares.match(c.req.path, c.req.method.toUpperCase());
    if (!x402Middleware) {
      return next();
    }

    try {
      const paymentRequirements = x402Middleware.paymentRequirements(c);
      const payment = await x402Middleware.acquirePayment(c, paymentRequirements);
      if (!payment) {
        const price = x402Middleware.config.price;
        const network = x402Middleware.config.network;
        const customPaywallHtml = x402Middleware.config.config?.customPaywallHtml;
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
            cdpClientKey: paywall?.cdpClientKey,
            appName: paywall?.appName,
            appLogo: paywall?.appLogo,
            sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
          });
        return c.html(html, 402);
      }
      // Proceed with request
      await next();

      const res = c.res;

      // If the response from the protected route is >= 400, do not settle payment
      if (res.status >= 400) {
        return;
      }

      const settlement = await payment.settle();
      const responseHeader = settleResponseHeader(settlement);
      res.headers.set("X-PAYMENT-RESPONSE", responseHeader);
    } catch (e) {
      if (e instanceof X402Error) {
        const headers = new Headers(c.res.headers);
        headers.set("Content-Type", "application/json");
        c.res = new Response(JSON.stringify(e), {
          headers: headers,
          status: 402,
        });
      } else {
        throw e;
      }
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
