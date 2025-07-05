import type { NextFunction, Request, Response } from "express";
import type { Address } from "viem";
import type { FacilitatorConfig, PaywallConfig, RoutesConfig } from "x402/types";
import { exact } from "x402/schemes";
import { getPaywallHtml, toJsonSafe } from "x402/shared";
import { moneySchema, settleResponseHeader } from "x402/types";
import { useFacilitator } from "x402/verify";
import { PaymentMiddleware, X402Error } from "x402/middleware";

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
  useFacilitatorFn: typeof useFacilitator = useFacilitator,
) {
  const middlewares = PaymentMiddleware.forRoutes<Request>(
    payTo,
    routes,
    function paymentFromRequest(req) {
      const paymentHeader = req.header("X-PAYMENT");
      if (!paymentHeader) {
        return undefined;
      }
      return exact.evm.decodePayment(paymentHeader);
    },
    function canRenderPaywall(req) {
      const userAgent = req.header("User-Agent") || "";
      const acceptHeader = req.header("Accept") || "";
      return acceptHeader.includes("text/html") && userAgent.includes("Mozilla");
    },
    facilitator,
    paywall,
    useFacilitatorFn,
  );

  return async function paymentMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Determine whether the current request matches any protected route.
    // If it doesn't, skip payment logic and proceed as usual.
    const x402Middleware = middlewares.match(req.path, req.method.toUpperCase());
    if (!x402Middleware) {
      return next();
    }

    const originalEnd = res.end.bind(res);
    const deferred = defer<EndArgs>();

    try {
      const paymentRequirements = x402Middleware.paymentRequirements(req);
      const payment = await x402Middleware.acquirePayment(req, paymentRequirements);
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
          customPaywallHtml ||
          getPaywallHtml({
            amount: displayAmount,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl: req.originalUrl,
            testnet: network === "base-sepolia",
            cdpClientKey: paywall?.cdpClientKey,
            appName: paywall?.appName,
            appLogo: paywall?.appLogo,
            sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
          });
        res.status(402).send(html);
        return;
      }

      // Monkey-patch `res.end` to capture when the response is finalized.
      // This allows us to defer settlement logic until after the underlying response is available.
      res.end = function (...args: EndArgs) {
        deferred.resolve(args);
        return res;
      };

      // Proceed to the next middleware or route handler.
      next();
      // Wait for the response to finish before attempting payment settlement.
      await deferred.promise;

      // If the response from the protected route is >= 400, do not settle payment
      if (res.statusCode >= 400) {
        // We turn res.end back to the original fn in the `finally` clause below.
        return;
      }

      const settlement = await payment.settle();
      const responseHeader = settleResponseHeader(settlement);
      res.setHeader("X-PAYMENT-RESPONSE", responseHeader);
    } catch (e) {
      // Return a structured 402 error response if the failure is a known x402 error
      // and the headers haven't yet been sent.
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
