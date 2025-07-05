import type { NextRequest } from "next/server";
import type { Address } from "viem";
import type { FacilitatorConfig, RoutesConfig, PaywallConfig, RouteConfig } from "x402/types";
import { NextResponse } from "next/server";
import { exact } from "x402/schemes";
import { getPaywallHtml, toJsonSafe } from "x402/shared";
import { moneySchema, settleResponseHeader } from "x402/types";
import { useFacilitator } from "x402/verify";
import { PaymentMiddleware, X402Error } from "x402/middleware";
import { PaymentPayload, Resource } from "x402/types";

import { POST } from "./api/session-token";

/**
 * Extracts and decodes a PaymentPayload from the X-PAYMENT header of a Next.js request.
 *
 * @param req - The incoming Next.js request.
 * @returns The decoded PaymentPayload if present, or undefined.
 */
function paymentFromRequest(req: NextRequest): PaymentPayload | undefined {
  const paymentHeader = req.headers.get("X-PAYMENT");
  if (!paymentHeader) {
    return undefined;
  }
  return exact.evm.decodePayment(paymentHeader);
}

/**
 * Derives the x402 resource identifier from the request URL.
 *
 * @param req - The incoming Next.js request.
 * @returns A resource string formatted as an absolute URL for use in payment requirements.
 */
function resourceFromRequest(req: NextRequest): Resource {
  return `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}` as Resource;
}

/**
 * Determines whether the request likely came from a browser capable of rendering a visual paywall.
 *
 * @param req - The incoming Next.js request.
 * @returns True if the request accepts HTML and comes from a browser (e.g., contains "Mozilla" in User-Agent).
 */
function canRenderPaywall(req: NextRequest): boolean {
  const userAgent = req.headers.get("User-Agent") || "";
  const acceptHeader = req.headers.get("Accept") || "";
  return acceptHeader.includes("text/html") && userAgent.includes("Mozilla");
}

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
  useFacilitatorFn: typeof useFacilitator = useFacilitator,
) {
  const middlewares = PaymentMiddleware.forRoutes<NextRequest>(
    payTo,
    routes,
    paymentFromRequest,
    canRenderPaywall,
    facilitator,
    paywall,
    useFacilitatorFn,
  );

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const method = request.method.toUpperCase();

    // Find matching route configuration
    const x402Middleware = middlewares.match(pathname, method);
    if (!x402Middleware) {
      return NextResponse.next();
    }
    try {
      const paymentRequirements = x402Middleware.paymentRequirements(request);
      const payment = await x402Middleware.acquirePayment(request, paymentRequirements);
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

        const html =
          customPaywallHtml ??
          getPaywallHtml({
            amount: displayAmount,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl: request.url,
            testnet: network === "base-sepolia",
            cdpClientKey: paywall?.cdpClientKey,
            appLogo: paywall?.appLogo,
            appName: paywall?.appName,
            sessionTokenEndpoint: paywall?.sessionTokenEndpoint,});
        return new NextResponse(html, {
          status: 402,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Proceed with request
      const response = NextResponse.next();
      // TODO `NextResponse.next` returns a fresh instance of NextResponse used to continue routing and modify headers.
      // There is no point to wait for it. We use it just to modify headers.
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
  },
) {
  const x402Middleware = new PaymentMiddleware<NextRequest>({
    payTo: config.payTo,
    network: config.network,
    price: config.price,
    config: config.config,
    facilitator: config.facilitator,
    paywall: config.paywall,
    paymentFromRequest,
    canRenderPaywall,
    resourceFromRequest,
  });
  const paywall = config.paywall;

  return async function middleware(request: NextRequest) {
    try {
      const paymentRequirements = x402Middleware.paymentRequirements(request);
      const payment = await x402Middleware.acquirePayment(request, paymentRequirements);
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

        const html =
          customPaywallHtml ??
          getPaywallHtml({
            amount: displayAmount,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl: request.url,
            testnet: network === "base-sepolia",
            cdpClientKey: paywall?.cdpClientKey,
            appLogo: paywall?.appLogo,
            appName: paywall?.appName,
          });
        return new NextResponse(html, {
          status: 402,
          headers: { "Content-Type": "text/html" },
        });
      }

      // Proceed with request
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
