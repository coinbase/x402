import {
  HTTPRequestContext,
  PaywallConfig,
  PaywallProvider,
  x402HTTPResourceServer,
  x402ResourceServer,
  RoutesConfig,
  FacilitatorClient,
} from "@x402/core/server";
import { SchemeNetworkServer, Network } from "@x402/core/types";
import { NextFunction, Request, Response } from "express";
import { ExpressAdapter } from "./adapter";

/**
 * Check if any routes in the configuration declare bazaar extensions
 *
 * @param routes - Route configuration
 * @returns True if any route has extensions.bazaar defined
 */
function checkIfBazaarNeeded(routes: RoutesConfig): boolean {
  // Handle single route config
  if ("accepts" in routes) {
    return !!(routes.extensions && "bazaar" in routes.extensions);
  }

  // Handle multiple routes
  return Object.values(routes).some(routeConfig => {
    return !!(routeConfig.extensions && "bazaar" in routeConfig.extensions);
  });
}

/**
 * Configuration for registering a payment scheme with a specific network
 */
export interface SchemeRegistration {
  /**
   * The network identifier (e.g., 'eip155:84532', 'solana:mainnet')
   */
  network: Network;

  /**
   * The scheme server implementation for this network
   */
  server: SchemeNetworkServer;
}

/**
 * Express payment middleware for x402 protocol (direct server instance).
 *
 * Use this when you want to pass a pre-configured x402ResourceServer instance.
 * This provides more flexibility for testing, custom configuration, and reusing
 * server instances across multiple middlewares.
 *
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddleware } from "@x402/express";
 * import { x402ResourceServer } from "@x402/core/server";
 * import { registerExactEvmScheme } from "@x402/evm/exact/server";
 *
 * const server = new x402ResourceServer(myFacilitatorClient);
 * registerExactEvmScheme(server, { signer: myServerSigner });
 *
 * app.use(paymentMiddleware(routes, server, paywallConfig));
 * ```
 */
export function paymentMiddleware(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
) {
  // Create the x402 HTTP server instance with the resource server
  const httpServer = new x402HTTPResourceServer(server, routes);

  // Register custom paywall provider if provided
  if (paywall) {
    httpServer.registerPaywallProvider(paywall);
  }

  // Store initialization promise (not the result)
  // httpServer.initialize() fetches facilitator support and validates routes
  let initPromise: Promise<void> | null = syncFacilitatorOnStart ? httpServer.initialize() : null;

  // Dynamically register bazaar extension if routes declare it
  let bazaarPromise: Promise<void> | null = null;
  if (checkIfBazaarNeeded(routes)) {
    bazaarPromise = import("@x402/extensions/bazaar")
      .then(({ bazaarResourceServerExtension }) => {
        server.registerExtension(bazaarResourceServerExtension);
      })
      .catch(err => {
        console.error("Failed to load bazaar extension:", err);
      });
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Create adapter and context
    const adapter = new ExpressAdapter(req);
    const context: HTTPRequestContext = {
      adapter,
      path: req.path,
      method: req.method,
      paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment"),
    };

    // Check if route requires payment before initializing facilitator
    if (!httpServer.requiresPayment(context)) {
      return next();
    }

    // Only initialize when processing a protected route
    if (initPromise) {
      await initPromise;
      initPromise = null; // Clear after first await
    }

    // Await bazaar extension loading if needed
    if (bazaarPromise) {
      await bazaarPromise;
      bazaarPromise = null;
    }

    // Process payment requirement check
    const result = await httpServer.processHTTPRequest(context, paywallConfig);

    // Handle the different result types
    switch (result.type) {
      case "no-payment-required":
        // No payment needed, proceed directly to the route handler
        return next();

      case "payment-error":
        // Payment required but not provided or invalid
        const { response } = result;
        res.status(response.status);
        Object.entries(response.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        if (response.isHtml) {
          res.send(response.body);
        } else {
          res.json(response.body || {});
        }
        return;

      case "payment-verified":
        // Payment is valid, need to wrap response for settlement
        const { paymentPayload, paymentRequirements } = result;

        // Intercept and buffer all core methods that can commit response to client
        const originalWriteHead = res.writeHead.bind(res);
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const originalFlushHeaders = res.flushHeaders.bind(res);

        type BufferedCall =
          | ["writeHead", Parameters<typeof originalWriteHead>]
          | ["write", Parameters<typeof originalWrite>]
          | ["end", Parameters<typeof originalEnd>]
          | ["flushHeaders", []];
        let bufferedCalls: BufferedCall[] = [];
        let settled = false;

        // Create a promise that resolves when the handler finishes and calls res.end()
        let endCalled: () => void;
        const endPromise = new Promise<void>(resolve => {
          endCalled = resolve;
        });

        res.writeHead = function (...args: Parameters<typeof originalWriteHead>) {
          if (!settled) {
            bufferedCalls.push(["writeHead", args]);
            return res;
          }
          return originalWriteHead(...args);
        } as typeof originalWriteHead;

        res.write = function (...args: Parameters<typeof originalWrite>) {
          if (!settled) {
            bufferedCalls.push(["write", args]);
            return true;
          }
          return originalWrite(...args);
        } as typeof originalWrite;

        res.end = function (...args: Parameters<typeof originalEnd>) {
          if (!settled) {
            bufferedCalls.push(["end", args]);
            // Signal that the handler has finished
            endCalled();
            return res;
          }
          return originalEnd(...args);
        } as typeof originalEnd;

        res.flushHeaders = function () {
          if (!settled) {
            bufferedCalls.push(["flushHeaders", []]);
            return;
          }
          return originalFlushHeaders();
        };

        // Proceed to the next middleware or route handler
        next();

        // Wait for the handler to actually call res.end() before checking status
        await endPromise;

        // If the response from the protected route is >= 400, do not settle payment
        if (res.statusCode >= 400) {
          settled = true;
          res.writeHead = originalWriteHead;
          res.write = originalWrite;
          res.end = originalEnd;
          res.flushHeaders = originalFlushHeaders;
          // Replay all buffered calls in order
          for (const [method, args] of bufferedCalls) {
            if (method === "writeHead")
              originalWriteHead(...(args as Parameters<typeof originalWriteHead>));
            else if (method === "write")
              originalWrite(...(args as Parameters<typeof originalWrite>));
            else if (method === "end") originalEnd(...(args as Parameters<typeof originalEnd>));
            else if (method === "flushHeaders") originalFlushHeaders();
          }
          bufferedCalls = [];
          return;
        }

        try {
          const settleResult = await httpServer.processSettlement(
            paymentPayload,
            paymentRequirements,
          );

          // If settlement fails, return an error and do not send the buffered response
          if (!settleResult.success) {
            bufferedCalls = [];
            res.status(402).json({
              error: "Settlement failed",
              details: settleResult.errorReason,
            });
            return;
          }

          // Settlement succeeded - add headers to response
          Object.entries(settleResult.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        } catch (error) {
          console.error(error);
          // If settlement fails, don't send the buffered response
          bufferedCalls = [];
          res.status(402).json({
            error: "Settlement failed",
            details: error instanceof Error ? error.message : "Unknown error",
          });
          return;
        } finally {
          settled = true;
          res.writeHead = originalWriteHead;
          res.write = originalWrite;
          res.end = originalEnd;
          res.flushHeaders = originalFlushHeaders;

          // Replay all buffered calls in order
          for (const [method, args] of bufferedCalls) {
            if (method === "writeHead")
              originalWriteHead(...(args as Parameters<typeof originalWriteHead>));
            else if (method === "write")
              originalWrite(...(args as Parameters<typeof originalWrite>));
            else if (method === "end") originalEnd(...(args as Parameters<typeof originalEnd>));
            else if (method === "flushHeaders") originalFlushHeaders();
          }
          bufferedCalls = [];
        }
        return;
    }
  };
}

/**
 * Express payment middleware for x402 protocol (configuration-based).
 *
 * Use this when you want to quickly set up middleware with simple configuration.
 * This function creates and configures the x402ResourceServer internally.
 *
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromConfig } from "@x402/express";
 *
 * app.use(paymentMiddlewareFromConfig(
 *   routes,
 *   myFacilitatorClient,
 *   [{ network: "eip155:8453", server: evmSchemeServer }],
 *   paywallConfig
 * ));
 * ```
 */
export function paymentMiddlewareFromConfig(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  schemes?: SchemeRegistration[],
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
) {
  const ResourceServer = new x402ResourceServer(facilitatorClients);

  if (schemes) {
    schemes.forEach(({ network, server: schemeServer }) => {
      ResourceServer.register(network, schemeServer);
    });
  }

  // Use the direct paymentMiddleware with the configured server
  // Note: paymentMiddleware handles dynamic bazaar registration
  return paymentMiddleware(routes, ResourceServer, paywallConfig, paywall, syncFacilitatorOnStart);
}

export { x402ResourceServer, x402HTTPResourceServer } from "@x402/core/server";

export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
} from "@x402/core/types";

export type { PaywallProvider, PaywallConfig } from "@x402/core/server";

export { RouteConfigurationError } from "@x402/core/server";

export type { RouteValidationError } from "@x402/core/server";

export { ExpressAdapter } from "./adapter";
