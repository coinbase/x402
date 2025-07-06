import type { Context } from "hono";
import { Address } from "viem";
import { ExactEvmMiddleware } from "x402/shared";
import { FacilitatorConfig, PaywallConfig, Resource, RoutesConfig } from "x402/types";

/**
 * Creates a payment middleware factory for Hono
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
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
) {
  const x402 = new ExactEvmMiddleware(payTo, routes, facilitator, paywall);

  return async function paymentMiddleware(c: Context, next: () => Promise<void>) {
    const resourceUrl: Resource = c.req.url as Resource;

    const result = await x402.processRequest(c.req.path, c.req.method, resourceUrl);

    if (!result.requiresPayment) {
      return next();
    }

    const { paymentRequirements, displayAmount, customPaywallHtml, network } = result;

    const payment = c.req.header("X-PAYMENT");

    if (!payment) {
      // Create headers object for browser detection
      const headers = {
        "user-agent": c.req.header("User-Agent"),
        accept: c.req.header("Accept"),
      };
      if (x402.isWebBrowser(headers)) {
        const currentUrl = new URL(c.req.url).pathname + new URL(c.req.url).search;
        const html = x402.generatePaywallHtml(
          paymentRequirements,
          displayAmount,
          currentUrl,
          network,
          customPaywallHtml,
        );
        return c.html(html, 402);
      }

      const errorResponse = x402.createErrorResponse(
        "X-PAYMENT header is required",
        paymentRequirements!,
      );
      return c.json(errorResponse, 402);
    }

    const verification = await x402.verifyPayment(payment, paymentRequirements!);

    if (!verification.success) {
      const errorResponse = x402.createErrorResponse(
        verification.error!,
        paymentRequirements!,
        verification.payer,
      );
      return c.json(errorResponse, 402);
    }

    // Proceed with request
    await next();

    let res = c.res;

    // If the response from the protected route is >= 400, do not settle payment
    if (res.status >= 400) {
      return;
    }

    c.res = undefined;

    // Settle payment before processing the request, as Hono middleware does not allow us to set headers after the response has been sent
    const settlement = await x402.settlePayment(
      verification.decodedPayment!,
      verification.selectedRequirements!,
    );

    if (settlement.success) {
      res.headers.set("X-PAYMENT-RESPONSE", settlement.responseHeader!);
    } else {
      res = c.json(x402.createErrorResponse(settlement.error!, paymentRequirements!), 402);
    }

    c.res = res;
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
