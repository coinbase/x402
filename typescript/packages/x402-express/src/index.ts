import { NextFunction, Request, Response } from "express";
import { Address } from "viem";
import { ExactEvmMiddleware } from "x402/shared";
import {
  FacilitatorConfig,
  PaywallConfig,
  Resource,
  RoutesConfig,
} from "x402/types";

/**
 * Creates a payment middleware factory for Express
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @returns An Express middleware handler
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

  return async function paymentMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const resourceUrl: Resource = `${req.protocol}://${req.headers.host}${req.path}` as Resource;

    const result = await x402.processRequest(
      req.path,
      req.method,
      resourceUrl,
    );

    if (!result.requiresPayment) {
      return next();
    }

    const { paymentRequirements, displayAmount, customPaywallHtml, network } = result;

    const payment = req.header("X-PAYMENT");

    if (!payment) {
      if (x402.isWebBrowser(req.headers)) {
        const html = x402.generatePaywallHtml(
          paymentRequirements,
          displayAmount,
          req.originalUrl,
          network,
          customPaywallHtml,
        );
        res.status(402).send(html);
        return;
      }

      const errorResponse = x402.createErrorResponse(
        "X-PAYMENT header is required",
        paymentRequirements!,
      );
      res.status(402).json(errorResponse);
      return;
    }

    const verification = await x402.verifyPayment(payment, paymentRequirements!);

    if (!verification.success) {
      const errorResponse = x402.createErrorResponse(
        verification.error!,
        paymentRequirements!,
        verification.payer,
      );
      res.status(402).json(errorResponse);
      return;
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

    // If the response from the protected route is >= 400, do not settle payment
    if (res.statusCode >= 400) {
      res.end = originalEnd;
      if (endArgs) {
        originalEnd(...(endArgs as Parameters<typeof res.end>));
      }
      return;
    }

    const settlement = await x402.settlePayment(
      verification.decodedPayment!,
      verification.selectedRequirements!,
    );

    if (settlement.success) {
      res.setHeader("X-PAYMENT-RESPONSE", settlement.responseHeader!);
    } else if (!res.headersSent) {
      const errorResponse = x402.createErrorResponse(
        settlement.error!,
        paymentRequirements!,
      );
      res.status(402).json(errorResponse);
      return;
    }

    // Restore original end method and call it with captured arguments
    res.end = originalEnd;
    if (endArgs) {
      originalEnd(...(endArgs as Parameters<typeof res.end>));
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
