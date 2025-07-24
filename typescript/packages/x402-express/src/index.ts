import type { NextFunction, Request, Response } from "express";
import type { Address } from "viem";
import type { FacilitatorConfig, PaywallConfig, Resource, RoutesConfig } from "x402/types";
import type { useFacilitator } from "x402/verify";
import { settleResponseHeader } from "x402/types";
import { PaymentMiddleware, X402Error, renderPaywallHtml } from "x402/middleware";

type EndArgs =
  | [cb?: () => void]
  | [chunk: unknown, cb?: () => void]
  | [chunk: unknown, encoding: BufferEncoding, cb?: () => void];

/**
 * Creates a deferred promise with exposed `resolve` and `reject` functions.
 *
 * Useful for integrating with callback-style APIs or pausing execution until
 * an external event (like `res.end`) occurs.
 *
 * @returns An object containing the promise, and its associated `resolve` and `reject` functions.
 */
function defer<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Creates a payment middleware factory for Express
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @param useFacilitatorFn - Optional useFacilitator function, used in dev/testing mode
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
 * app.use(paymentMiddleware('0x123...', // payTo: The address to receive payments*    {
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
  const middlewares = PaymentMiddleware.forRoutes<Request>({
    routes,
    payTo,
    facilitator,
    paywall,
    getHeader: (req, name) => req.header(name),
    useFacilitatorFn,
  });

  return async function paymentMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Determine whether the current request matches any protected route.
    // If it doesn't, skip payment logic and proceed as usual.
    const x402 = middlewares.match(req.path, req.method.toUpperCase());
    if (!x402) {
      return next();
    }

    const originalEnd = res.end.bind(res);
    const deferred = defer<EndArgs>();

    const resource = `${req.protocol}://${req.headers.host}${req.path}` as Resource;
    try {
      const paymentRequirements = x402.paymentRequirements(resource);
      const payment = await x402.verifyPayment(req, paymentRequirements);
      if (!payment) {
        const html = renderPaywallHtml(x402, paymentRequirements, req.originalUrl);
        res.status(402).send(html);
        return;
      }

      // Monkey-patch `res.end` to capture when the response is finalized.
      // This allows us to defer settlement logic until after the underlying response is available.
      res.end = function (...args: EndArgs) {
        deferred.resolve(args);
        return res;
      };

      next();
      await deferred.promise; // Wait for the response to finish before attempting payment settlement.

      if (res.statusCode >= 400) {
        return; // We turn res.end back to the original fn in the `finally` clause below.
      }

      const settlement = await payment.settle();
      const responseHeader = settleResponseHeader(settlement);
      res.setHeader("X-PAYMENT-RESPONSE", responseHeader);
    } catch (e) {
      if (e instanceof X402Error) {
        if (!res.headersSent) {
          res.status(402).json(e.toJSON());
          return;
        }
      } else {
        throw e;
      }
    } finally {
      // Ensure the original `res.end` is restored to avoid side effects.
      // Then call it with the originally captured arguments to finalize the response.
      res.end = originalEnd;
      deferred.promise.then(endArgs => {
        originalEnd(...(endArgs as Parameters<typeof res.end>));
      });
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
