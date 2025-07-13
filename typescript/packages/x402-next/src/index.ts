import type { NextRequest } from "next/server";
import type { Address } from "viem";
import type {
  FacilitatorConfig,
  RoutesConfig,
  PaywallConfig,
  Resource,
  RouteConfig,
} from "x402/types";
import type { useFacilitator } from "x402/verify";
import { NextResponse } from "next/server";
import { settleResponseHeader } from "x402/types";
import { PaymentMiddleware, X402Error, renderPaywallHtml } from "x402/middleware";
import { POST } from "./api/session-token";

/**
 * Creates a payment middleware factory for Next.js
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @param useFacilitatorFn - Optional useFacilitator function, used in dev/testing mode
 * @returns A Next.js middleware handler
 *
 * @example
 * ```typescript
 * // Simple configuration - All endpoints are protected by $0.01 of USDC on base-sepolia
 * export const middleware = paymentMiddleware(
 *   '0x123...', // payTo address
 *   {
 *     price: '$0.01', // USDC amount in dollars
 *     network: 'base-sepolia'
 *   },
 *   // Optional facilitator configuration. Defaults to x402.org/facilitator for testnet usage
 * );
 *
 * // Advanced configuration - Endpoint-specific payment requirements & custom facilitator
 * export const middleware = paymentMiddleware(
 *   '0x123...', // payTo: The address to receive payments
 *   {
 *     '/protected/*': {
 *       price: '$0.001', // USDC amount in dollars
 *       network: 'base',
 *       config: {
 *         description: 'Access to protected content'
 *       }
 *     },
 *     '/api/premium/*': {
 *       price: {
 *         amount: '100000',
 *         asset: {
 *           address: '0xabc',
 *           decimals: 18,
 *           eip712: {
 *             name: 'WETH',
 *             version: '1'
 *           }
 *         }
 *       },
 *       network: 'base'
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
 * );
 * ```
 */
export function paymentMiddleware(
  payTo: Address,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
  useFacilitatorFn?: typeof useFacilitator,
) {
  const middlewares = PaymentMiddleware.forRoutes<NextRequest>({
    routes,
    payTo,
    facilitator,
    paywall,
    getHeader: (req, name) => req.headers.get(name),
    useFacilitatorFn,
  });

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const method = request.method.toUpperCase();

    // Find matching route configuration
    const x402 = middlewares.match(pathname, method);
    if (!x402) {
      return NextResponse.next();
    }
    const handler = nextHandler(x402, async () => NextResponse.next());
    return handler(request);
  };
}

/**
 * Wraps an individual route handler with x402 payment enforcement in Next.js.
 *
 * This is useful for applying payments to dynamic or API routes like `/api/secure-data`.
 * If the request contains a valid payment, the handler is executed and the payment is settled.
 * Otherwise, the client receives a 402 response (either HTML or JSON).
 *
 * @param handler - A Next.js-compatible async route handler function.
 * @param config - Route-specific configuration for price, network, payee, and optional paywall/facilitator.
 * @returns A wrapped Next.js handler that enforces x402 payment requirements before executing the route logic.
 *
 * @example
 * ```ts
 * export const GET = withPayment(
 *   async (req) => {
 *     return new Response("Hello, world!");
 *   },
 *   {
 *     price: "$0.01",
 *     network: "base",
 *     payTo: "0xRecipientAddress"
 *   }
 * );
 * ```
 */
export function withPayment(
  handler: (req: NextRequest) => Promise<Response>,
  config: RouteConfig & {
    payTo: string;
    facilitator?: FacilitatorConfig;
    paywall?: PaywallConfig;
    useFacilitatorFn?: typeof useFacilitator;
  },
) {
  const x402 = new PaymentMiddleware<NextRequest>({
    payTo: config.payTo,
    network: config.network,
    price: config.price,
    config: config.config,
    facilitator: config.facilitator,
    paywall: config.paywall,
    getHeader: (req, name) => req.headers.get(name),
    useFacilitatorFn: config.useFacilitatorFn,
  });
  return nextHandler(x402, handler);
}

/**
 * Internal helper that wraps a request handler with x402 payment enforcement logic
 * for use in Next.js middleware `paymentMiddleware` or route-level handlers via `withPayment`.
 *
 * This function performs the full x402 payment lifecycle around `handler`.
 *
 * @param x402 - The `PaymentMiddleware` instance configured for the current route
 * @param handler - A user-defined async function that handles the request after successful payment
 * @returns A Next.js-compatible handler that enforces payment and returns the original or 402 response
 *
 * @internal
 */
function nextHandler(
  x402: PaymentMiddleware<NextRequest>,
  handler: (req: NextRequest) => Promise<Response>,
) {
  return async function handle(request: NextRequest): Promise<Response | NextResponse> {
    const resource =
      `${request.nextUrl.protocol}//${request.nextUrl.host}${request.nextUrl.pathname}` as Resource;
    try {
      const paymentRequirements = x402.paymentRequirements(resource);
      const payment = await x402.verifyPayment(request, paymentRequirements);
      if (!payment) {
        const html = renderPaywallHtml(x402, paymentRequirements, request.url);
        return new NextResponse(html, {
          status: 402,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Proceed with request
      // NOTE: `NextResponse.next` returns a fresh instance of NextResponse used to continue routing and modify headers.
      // There is no point in waiting for it. We use it just to modify headers.
      const response = await handler(request);
      const settlement = await payment.settle();
      const responseHeader = settleResponseHeader(settlement);
      response.headers.set("X-PAYMENT-RESPONSE", responseHeader);
      return response;
    } catch (e) {
      if (e instanceof X402Error) {
        return new NextResponse(JSON.stringify(e), {
          headers: {
            "Content-Type": "application/json",
          },
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

// Export session token API handlers for Onramp
export { POST };
