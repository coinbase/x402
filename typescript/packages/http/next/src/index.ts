import {
  PaywallConfig,
  PaywallProvider,
  x402ResourceServer,
  RoutesConfig,
  RouteConfig,
  FacilitatorClient,
} from "@x402/core/server";
import { SchemeNetworkServer, Network } from "@x402/core/types";
import { NextRequest, NextResponse } from "next/server";
import {
  createHttpServer,
  createRequestContext,
  handlePaymentError,
  handleSettlement,
} from "./utils";

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
 * Next.js payment proxy for x402 protocol (direct server instance).
 *
 * Use this when you want to pass a pre-configured x402ResourceServer instance.
 * This provides more flexibility for testing, custom configuration, and reusing
 * server instances across multiple proxies.
 *
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Next.js proxy handler
 *
 * @example
 * ```typescript
 * import { paymentProxy } from "@x402/next";
 * import { x402ResourceServer } from "@x402/core/server";
 * import { registerExactEvmScheme } from "@x402/evm/exact/server";
 *
 * const server = new x402ResourceServer(myFacilitatorClient);
 * registerExactEvmScheme(server, {});
 *
 * export const proxy = paymentProxy(routes, server, paywallConfig);
 * ```
 */
export function paymentProxy(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
) {
  const { httpServer, init } = createHttpServer(routes, server, paywall, syncFacilitatorOnStart);

  // Dynamically register bazaar extension if routes declare it
  let bazaarPromise: Promise<void> | null = null;
  if (checkIfBazaarNeeded(routes)) {
    bazaarPromise = import(/* webpackIgnore: true */ "@x402/extensions/bazaar")
      .then(({ bazaarResourceServerExtension }) => {
        server.registerExtension(bazaarResourceServerExtension);
      })
      .catch(err => {
        console.error("Failed to load bazaar extension:", err);
      });
  }

  return async (req: NextRequest) => {
    const context = createRequestContext(req);

    // Check if route requires payment before initializing facilitator
    if (!httpServer.requiresPayment(context)) {
      return NextResponse.next();
    }

    // Only initialize when processing a protected route
    await init();

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
        return NextResponse.next();

      case "payment-error":
        return handlePaymentError(result.response);

      case "payment-verified": {
        // Payment is valid, need to wrap response for settlement
        const { paymentPayload, paymentRequirements } = result;

        // Proceed to the next proxy or route handler
        const nextResponse = NextResponse.next();
        return handleSettlement(httpServer, nextResponse, paymentPayload, paymentRequirements);
      }
    }
  };
}

/**
 * Next.js payment proxy for x402 protocol (configuration-based).
 *
 * Use this when you want to quickly set up proxy with simple configuration.
 * This function creates and configures the x402ResourceServer internally.
 *
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Next.js proxy handler
 *
 * @example
 * ```typescript
 * import { paymentProxyFromConfig } from "@x402/next";
 *
 * export const proxy = paymentProxyFromConfig(
 *   routes,
 *   myFacilitatorClient,
 *   [{ network: "eip155:8453", server: evmSchemeServer }],
 *   paywallConfig
 * );
 * ```
 */
export function paymentProxyFromConfig(
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

  // Use the direct paymentProxy with the configured server
  // Note: paymentProxy handles dynamic bazaar registration
  return paymentProxy(routes, ResourceServer, paywallConfig, paywall, syncFacilitatorOnStart);
}

/**
 * Wraps a Next.js App Router API route handler with x402 payment protection.
 *
 * Unlike `paymentProxy` which works as middleware, `withX402` wraps individual route handlers
 * and guarantees that payment settlement only occurs after the handler returns a successful
 * response (status < 400). This provides more precise control over when payments are settled.
 *
 * @param routeHandler - The API route handler function to wrap
 * @param routeConfig - Payment configuration for this specific route
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns A wrapped Next.js route handler
 *
 * @example
 * ```typescript
 * import { NextRequest, NextResponse } from "next/server";
 * import { withX402 } from "@x402/next";
 * import { x402ResourceServer } from "@x402/core/server";
 * import { registerExactEvmScheme } from "@x402/evm/exact/server";
 *
 * const server = new x402ResourceServer(myFacilitatorClient);
 * registerExactEvmScheme(server, {});
 *
 * const handler = async (request: NextRequest) => {
 *   return NextResponse.json({ data: "protected content" });
 * };
 *
 * export const GET = withX402(
 *   handler,
 *   {
 *     accepts: {
 *       scheme: "exact",
 *       payTo: "0x123...",
 *       price: "$0.01",
 *       network: "eip155:84532",
 *     },
 *     description: "Access to protected API",
 *   },
 *   server,
 * );
 * ```
 */
export function withX402<T = unknown>(
  routeHandler: (request: NextRequest) => Promise<NextResponse<T>>,
  routeConfig: RouteConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
): (request: NextRequest) => Promise<NextResponse<T>> {
  const routes = { "*": routeConfig };
  const { httpServer, init } = createHttpServer(routes, server, paywall, syncFacilitatorOnStart);

  // Dynamically register bazaar extension if route declares it
  let bazaarPromise: Promise<void> | null = null;
  if (checkIfBazaarNeeded(routes)) {
    bazaarPromise = import(/* webpackIgnore: true */ "@x402/extensions/bazaar")
      .then(({ bazaarResourceServerExtension }) => {
        server.registerExtension(bazaarResourceServerExtension);
      })
      .catch(err => {
        console.error("Failed to load bazaar extension:", err);
      });
  }

  return async (request: NextRequest): Promise<NextResponse<T>> => {
    await init();

    // Await bazaar extension loading if needed
    if (bazaarPromise) {
      await bazaarPromise;
      bazaarPromise = null;
    }

    const context = createRequestContext(request);

    // Process payment requirement check
    const result = await httpServer.processHTTPRequest(context, paywallConfig);

    // Handle the different result types
    switch (result.type) {
      case "no-payment-required":
        // No payment needed, proceed directly to the route handler
        return routeHandler(request);

      case "payment-error":
        return handlePaymentError(result.response) as NextResponse<T>;

      case "payment-verified": {
        // Payment is valid, need to wrap response for settlement
        const { paymentPayload, paymentRequirements } = result;
        const handlerResponse = await routeHandler(request);
        return handleSettlement(
          httpServer,
          handlerResponse,
          paymentPayload,
          paymentRequirements,
        ) as Promise<NextResponse<T>>;
      }
    }
  };
}

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

export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  Network,
  SchemeNetworkServer,
} from "@x402/core/types";

export type { PaywallProvider, PaywallConfig, RouteConfig } from "@x402/core/server";

export { RouteConfigurationError } from "@x402/core/server";

export type { RouteValidationError } from "@x402/core/server";

export { NextAdapter } from "./adapter";
