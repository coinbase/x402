import type { Context } from "hono";
import type { Address } from "viem";
import type { FacilitatorConfig, RoutesConfig, PaywallConfig, Resource } from "x402/types";
import type { useFacilitator } from "x402/verify";
import { settleResponseHeader } from "x402/types";
import { PaymentMiddleware, X402Error, renderPaywallHtml } from "x402/middleware";

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
  useFacilitatorFn?: typeof useFacilitator,
) {
  const middlewares = PaymentMiddleware.forRoutes<Context>({
    routes,
    payTo,
    facilitator,
    paywall,
    getHeader: (ctx, name) => ctx.req.header(name),
    useFacilitatorFn,
  });

  return async function paymentMiddleware(ctx: Context, next: () => Promise<void>) {
    const x402 = middlewares.match(ctx.req.path, ctx.req.method.toUpperCase());
    if (!x402) {
      return next();
    }

    const resource = ctx.req.url as Resource;

    try {
      const paymentRequirements = x402.paymentRequirements(resource);
      const payment = await x402.verifyPayment(ctx, paymentRequirements);
      if (!payment) {
        const currentUrl = new URL(ctx.req.url).pathname + new URL(ctx.req.url).search;
        const html = renderPaywallHtml(x402, paymentRequirements, currentUrl);
        return ctx.html(html, 402);
      }
      // Proceed with request
      await next();

      // If the response from the protected route is >= 400, do not settle payment
      if (ctx.res.status >= 400) {
        return;
      }

      const settlement = await payment.settle();
      const responseHeader = settleResponseHeader(settlement);
      ctx.res.headers.set("X-PAYMENT-RESPONSE", responseHeader);
    } catch (e) {
      if (e instanceof X402Error) {
        const headers = new Headers(ctx.res.headers);
        headers.set("Content-Type", "application/json");
        ctx.res = new Response(JSON.stringify(e), {
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
