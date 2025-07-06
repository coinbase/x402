import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Address } from "viem";
import { ExactEvmMiddleware } from "x402/shared";
import {
  FacilitatorConfig,
  PaywallConfig,
  Resource,
  RoutesConfig,
} from "x402/types";
import { safeBase64Encode } from "x402/shared";

/**
 * Creates a payment middleware factory for Next.js
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
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
) {
  const x402 = new ExactEvmMiddleware(payTo, routes, facilitator, paywall);

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const method = request.method.toUpperCase();

    const resourceUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}${pathname}` as Resource;

    const result = await x402.processRequest(
      pathname,
      method,
      resourceUrl,
    );

    if (!result.requiresPayment) {
      return NextResponse.next();
    }

    const { paymentRequirements, displayAmount, customPaywallHtml, network } = result;

    // Check for payment header
    const paymentHeader = request.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      const accept = request.headers.get("Accept");
      if (accept?.includes("text/html")) {
        const userAgent = request.headers.get("User-Agent");
        if (userAgent?.includes("Mozilla")) {
          const html = x402.generatePaywallHtml(
            paymentRequirements,
            displayAmount,
            request.url,
            network,
            customPaywallHtml,
          );
          return new NextResponse(html, {
            status: 402,
            headers: { "Content-Type": "text/html" },
          });
        }
      }

      const errorResponse = x402.createErrorResponse(
        "X-PAYMENT header is required",
        paymentRequirements!,
      );
      return new NextResponse(
        JSON.stringify(errorResponse),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    const verification = await x402.verifyPayment(paymentHeader, paymentRequirements!);

    if (!verification.success) {
      const errorResponse = x402.createErrorResponse(
        verification.error!,
        paymentRequirements!,
        verification.payer,
      );
      return new NextResponse(
        JSON.stringify(errorResponse),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    // Proceed with request
    const response = await NextResponse.next();

    // if the response from the protected route is >= 400, do not settle the payment
    if (response.status >= 400) {
      return response;
    }

    // Settle payment after response
    const settlement = await x402.settlePayment(
      verification.decodedPayment!,
      verification.selectedRequirements!,
    );

    if (settlement.success) {
      response.headers.set(
        "X-PAYMENT-RESPONSE",
        safeBase64Encode(
          JSON.stringify({
            success: true,
            transaction: settlement.responseHeader,
            network: network!,
            payer: verification.payer,
          }),
        ),
      );
    } else {
      const errorResponse = x402.createErrorResponse(
        settlement.error!,
        paymentRequirements!,
      );
      return new NextResponse(
        JSON.stringify(errorResponse),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    return response;
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
