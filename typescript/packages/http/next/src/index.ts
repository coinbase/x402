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
import { NextRequest, NextResponse } from "next/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";

/**
 * Next.js adapter implementation
 */
export class NextAdapter implements HTTPAdapter {
  /**
   * Creates a new NextAdapter instance.
   *
   * @param req - The Next.js request object
   */
  constructor(private req: NextRequest) {}

  /**
   * Gets a header value from the request.
   *
   * @param name - The header name
   * @returns The header value or undefined
   */
  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) || undefined;
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
    return this.req.nextUrl.pathname;
  }

  /**
   * Gets the full URL of the request.
   *
   * @returns The full request URL
   */
  getUrl(): string {
    return this.req.url;
  }

  /**
   * Gets the Accept header from the request.
   *
   * @returns The Accept header value or empty string
   */
  getAcceptHeader(): string {
    return this.req.headers.get("Accept") || "";
  }

  /**
   * Gets the User-Agent header from the request.
   *
   * @returns The User-Agent header value or empty string
   */
  getUserAgent(): string {
    return this.req.headers.get("User-Agent") || "";
  }

  /**
   * Gets all query parameters from the request URL.
   *
   * @returns Record of query parameter key-value pairs
   */
  getQueryParams(): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    this.req.nextUrl.searchParams.forEach((value, key) => {
      const existing = params[key];
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          params[key] = [existing, value];
        }
      } else {
        params[key] = value;
      }
    });
    return params;
  }

  /**
   * Gets a specific query parameter by name.
   *
   * @param name - The query parameter name
   * @returns The query parameter value(s) or undefined
   */
  getQueryParam(name: string): string | string[] | undefined {
    const all = this.req.nextUrl.searchParams.getAll(name);
    if (all.length === 0) return undefined;
    if (all.length === 1) return all[0];
    return all;
  }

  /**
   * Gets the parsed request body.
   *
   * @returns Promise resolving to the parsed request body
   */
  async getBody(): Promise<unknown> {
    try {
      return await this.req.json();
    } catch {
      return undefined;
    }
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
 * Next.js payment middleware for x402 protocol (direct server instance).
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
 * @returns Next.js middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddleware } from "@x402/next";
 * import { x402ResourceServer } from "@x402/core/server";
 * import { registerExactEvmScheme } from "@x402/evm/exact/server";
 *
 * const server = new x402ResourceServer(myFacilitatorClient);
 * registerExactEvmScheme(server, {});
 *
 * export const middleware = paymentMiddleware(routes, server, paywallConfig);
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

  return async (req: NextRequest) => {
    // Ensure initialization completes before processing
    if (initPromise) {
      await initPromise;
      initPromise = null; // Clear after first await
    }

    // Create adapter and context
    const adapter = new NextAdapter(req);
    const context: HTTPRequestContext = {
      adapter,
      path: req.nextUrl.pathname,
      method: req.method,
      paymentHeader: adapter.getHeader("payment-signature") || adapter.getHeader("x-payment"),
    };

    // Process payment requirement check
    const result = await httpServer.processHTTPRequest(context, paywallConfig);

    // Handle the different result types
    switch (result.type) {
      case "no-payment-required":
        // No payment needed, proceed directly to the route handler
        return NextResponse.next();

      case "payment-error":
        // Payment required but not provided or invalid
        const { response } = result;
        const headers = new Headers(response.headers);
        if (response.isHtml) {
          headers.set("Content-Type", "text/html");
          return new NextResponse(response.body as string, {
            status: response.status,
            headers,
          });
        } else {
          headers.set("Content-Type", "application/json");
          return new NextResponse(JSON.stringify(response.body || {}), {
            status: response.status,
            headers,
          });
        }

      case "payment-verified":
        // Payment is valid, need to wrap response for settlement
        const { paymentPayload, paymentRequirements } = result;

        // Proceed to the next middleware or route handler
        const nextResponse = await NextResponse.next();

        // If the response from the protected route is >= 400, do not settle payment
        if (nextResponse.status >= 400) {
          return nextResponse;
        }

        try {
          const settlementHeaders = await httpServer.processSettlement(
            paymentPayload,
            paymentRequirements,
            nextResponse.status,
          );

          if (settlementHeaders) {
            Object.entries(settlementHeaders).forEach(([key, value]) => {
              nextResponse.headers.set(key, value);
            });
          }

          // If settlement returns null or succeeds, continue with original response
          return nextResponse;
        } catch (error) {
          console.error(error);
          // If settlement fails, return an error response
          return new NextResponse(
            JSON.stringify({
              error: "Settlement failed",
              details: error instanceof Error ? error.message : "Unknown error",
            }),
            {
              status: 402,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
    }
  };
}

/**
 * Next.js payment middleware for x402 protocol (configuration-based).
 *
 * Use this when you want to quickly set up middleware with simple configuration.
 * This function creates and configures the x402ResourceServer internally.
 *
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param initializeOnStart - Whether to initialize the server on startup (defaults to true)
 * @returns Next.js middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromConfig } from "@x402/next";
 *
 * export const middleware = paymentMiddlewareFromConfig(
 *   routes,
 *   myFacilitatorClient,
 *   [{ network: "eip155:8453", server: evmSchemeServer }],
 *   paywallConfig
 * );
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

export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
} from "@x402/core/types";

export type { PaywallProvider, PaywallConfig } from "@x402/core/server";
