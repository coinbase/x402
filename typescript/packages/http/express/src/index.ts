import {
  HTTPAdapter,
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
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";

/**
 * Express adapter implementation
 */
export class ExpressAdapter implements HTTPAdapter {
  /**
   * Creates a new ExpressAdapter instance.
   *
   * @param req - The Express request object
   */
  constructor(private req: Request) {}

  /**
   * Gets a header value from the request.
   *
   * @param name - The header name
   * @returns The header value or undefined
   */
  getHeader(name: string): string | undefined {
    const value = this.req.header(name);
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Gets the HTTP method of the request.
   *
   * @returns The HTTP method
   */
  getMethod(): string {
    return this.req.method;
  }

  /**
   * Gets the path of the request.
   *
   * @returns The request path
   */
  getPath(): string {
    return this.req.path;
  }

  /**
   * Gets the full URL of the request.
   *
   * @returns The full request URL
   */
  getUrl(): string {
    return `${this.req.protocol}://${this.req.headers.host}${this.req.path}`;
  }

  /**
   * Gets the Accept header from the request.
   *
   * @returns The Accept header value or empty string
   */
  getAcceptHeader(): string {
    return this.req.header("Accept") || "";
  }

  /**
   * Gets the User-Agent header from the request.
   *
   * @returns The User-Agent header value or empty string
   */
  getUserAgent(): string {
    return this.req.header("User-Agent") || "";
  }

  /**
   * Gets all query parameters from the request URL.
   *
   * @returns Record of query parameter key-value pairs
   */
  getQueryParams(): Record<string, string | string[]> {
    return this.req.query as Record<string, string | string[]>;
  }

  /**
   * Gets a specific query parameter by name.
   *
   * @param name - The query parameter name
   * @returns The query parameter value(s) or undefined
   */
  getQueryParam(name: string): string | string[] | undefined {
    const value = this.req.query[name];
    return value as string | string[] | undefined;
  }

  /**
   * Gets the parsed request body.
   * Requires express.json() or express.urlencoded() middleware.
   *
   * @returns The parsed request body
   */
  getBody(): unknown {
    return this.req.body;
  }
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
 * @param initializeOnStart - Whether to initialize the server on startup (defaults to true)
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
  initializeOnStart: boolean = true,
) {
  // Create the x402 HTTP server instance with the resource server
  const httpServer = new x402HTTPResourceServer(server, routes);

  // Register custom paywall provider if provided
  if (paywall) {
    httpServer.registerPaywallProvider(paywall);
  }

  // Store initialization promise (not the result)
  let initPromise: Promise<void> | null = initializeOnStart ? server.initialize() : null;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Ensure initialization completes before processing
    if (initPromise) {
      await initPromise;
      initPromise = null; // Clear after first await
    }

    // Create adapter and context
    const adapter = new ExpressAdapter(req);
    const context: HTTPRequestContext = {
      adapter,
      path: req.path,
      method: req.method,
      paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment"),
    };

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

        try {
          const settlementHeaders = await httpServer.processSettlement(
            paymentPayload,
            paymentRequirements,
            res.statusCode,
          );

          if (settlementHeaders) {
            Object.entries(settlementHeaders).forEach(([key, value]) => {
              res.setHeader(key, value);
            });
          }

          // If settlement returns null or succeeds, continue with original response
        } catch (error) {
          console.error(error);
          // If settlement fails and the response hasn't been sent yet, return an error
          if (!res.headersSent) {
            res.status(402).json({
              error: "Settlement failed",
              details: error instanceof Error ? error.message : "Unknown error",
            });
            return;
          }
        } finally {
          res.end = originalEnd;
          if (endArgs) {
            originalEnd(...(endArgs as Parameters<typeof res.end>));
          }
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
 * @param initializeOnStart - Whether to initialize the server on startup
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
  initializeOnStart: boolean = true,
) {
  const ResourceServer = new x402ResourceServer(facilitatorClients);

  ResourceServer.registerExtension(bazaarResourceServerExtension);

  if (schemes) {
    schemes.forEach(({ network, server: schemeServer }) => {
      ResourceServer.register(network, schemeServer);
    });
  }

  // Use the direct paymentMiddleware with the configured server
  return paymentMiddleware(routes, ResourceServer, paywallConfig, paywall, initializeOnStart);
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
