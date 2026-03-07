import {
  HTTPRequestContext,
  PaywallConfig,
  PaywallProvider,
  x402HTTPResourceServer,
  x402ResourceServer,
  RoutesConfig,
  FacilitatorClient,
} from "@x402/core/server";
import {
  SchemeNetworkServer,
  Network,
  PaymentPayload,
  PaymentRequirements,
} from "@x402/core/types";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { FastifyAdapter } from "./adapter";

/**
 * Symbol used to store x402 payment context on the request object.
 */
const kX402Context = Symbol("x402Context");

/**
 * Extended request type with x402 payment context.
 */
interface X402PaymentContext {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  declaredExtensions?: Record<string, unknown>;
  requestContext: HTTPRequestContext;
}

/**
 * Gets a header value from a plain header record using a case-insensitive lookup.
 *
 * @param headers - Headers to search
 * @param headerName - Header name to find
 * @returns Matching header value or undefined
 */
function getHeaderValue(headers: Record<string, string>, headerName: string): string | undefined {
  const target = headerName.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
}

/**
 * Converts a Fastify onSend payload into the byte representation used for settlement.
 *
 * @param payload - Fastify payload
 * @returns Buffer when the payload can be represented eagerly, otherwise undefined
 */
function getResponseBodyBuffer(payload: unknown): Buffer | undefined {
  if (typeof payload === "string") {
    return Buffer.from(payload);
  }

  if (Buffer.isBuffer(payload)) {
    return payload;
  }

  if (payload instanceof Uint8Array) {
    return Buffer.from(payload);
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(payload));
  }

  if (payload && typeof payload === "object" && "pipe" in payload) {
    return undefined;
  }

  return Buffer.from(JSON.stringify(payload ?? {}));
}

/**
 * Check if any routes in the configuration declare bazaar extensions.
 *
 * @param routes - Route configuration
 * @returns True if any route has extensions.bazaar defined
 */
function checkIfBazaarNeeded(routes: RoutesConfig): boolean {
  if ("accepts" in routes) {
    return !!(routes.extensions && "bazaar" in routes.extensions);
  }

  return Object.values(routes).some(routeConfig => {
    return !!(routeConfig.extensions && "bazaar" in routeConfig.extensions);
  });
}

/**
 * Configuration for registering a payment scheme with a specific network.
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
 * Registers x402 payment middleware on a Fastify instance using a pre-configured HTTP server.
 *
 * Use this when you need to configure HTTP-level hooks.
 *
 * @param app - The Fastify instance
 * @param httpServer - Pre-configured x402HTTPResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer } from "@x402/fastify";
 *
 * const resourceServer = new x402ResourceServer(facilitatorClient)
 *   .register(NETWORK, new ExactEvmScheme());
 *
 * const httpServer = new x402HTTPResourceServer(resourceServer, routes)
 *   .onProtectedRequest(requestHook);
 *
 * paymentMiddlewareFromHTTPServer(app, httpServer);
 * ```
 */
export function paymentMiddlewareFromHTTPServer(
  app: FastifyInstance,
  httpServer: x402HTTPResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
): void {
  if (paywall) {
    httpServer.registerPaywallProvider(paywall);
  }

  let initPromise: Promise<void> | null = syncFacilitatorOnStart ? httpServer.initialize() : null;

  let bazaarPromise: Promise<void> | null = null;
  if (checkIfBazaarNeeded(httpServer.routes) && !httpServer.server.hasExtension("bazaar")) {
    bazaarPromise = import("@x402/extensions/bazaar")
      .then(({ bazaarResourceServerExtension }) => {
        httpServer.server.registerExtension(bazaarResourceServerExtension);
      })
      .catch(err => {
        console.error("Failed to load bazaar extension:", err);
      });
  }

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    const adapter = new FastifyAdapter(request);
    const context: HTTPRequestContext = {
      adapter,
      path,
      method: request.method,
      paymentHeader:
        (request.headers["payment-signature"] as string | undefined) ||
        (request.headers["x-payment"] as string | undefined),
    };

    if (!httpServer.requiresPayment(context)) {
      return;
    }

    if (initPromise) {
      await initPromise;
      initPromise = null;
    }

    if (bazaarPromise) {
      await bazaarPromise;
      bazaarPromise = null;
    }

    const result = await httpServer.processHTTPRequest(context, paywallConfig);

    switch (result.type) {
      case "no-payment-required":
        return;

      case "payment-error": {
        const { response } = result;
        for (const [key, value] of Object.entries(response.headers)) {
          reply.header(key, value);
        }
        if (response.isHtml) {
          return reply.status(response.status).type("text/html").send(response.body);
        } else {
          return reply.status(response.status).send(response.body || {});
        }
      }

      case "payment-verified": {
        const x402Context: X402PaymentContext = {
          paymentPayload: result.paymentPayload,
          paymentRequirements: result.paymentRequirements,
          declaredExtensions: result.declaredExtensions,
          requestContext: context,
        };
        (request as unknown as Record<symbol, unknown>)[kX402Context] = x402Context;
        return;
      }
    }
  });

  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const x402Context = (request as unknown as Record<symbol, unknown>)[kX402Context] as
      | X402PaymentContext
      | undefined;

    if (!x402Context) {
      return payload;
    }

    if (reply.statusCode >= 400) {
      return payload;
    }

    try {
      const responseBody = getResponseBodyBuffer(payload);

      const settleResult = await httpServer.processSettlement(
        x402Context.paymentPayload,
        x402Context.paymentRequirements,
        x402Context.declaredExtensions,
        { request: x402Context.requestContext, responseBody },
      );

      if (!settleResult.success) {
        const { response } = settleResult;
        for (const [key, value] of Object.entries(response.headers)) {
          reply.header(key, value);
        }
        reply.status(response.status);
        reply.type(
          getHeaderValue(response.headers, "content-type") ||
            (response.isHtml ? "text/html" : "application/json"),
        );
        return response.isHtml ? String(response.body ?? "") : JSON.stringify(response.body ?? {});
      }

      for (const [key, value] of Object.entries(settleResult.headers)) {
        reply.header(key, value);
      }
      return payload;
    } catch (error) {
      console.error(error);
      reply.status(402);
      reply.type("application/json");
      return JSON.stringify({});
    }
  });
}

/**
 * Registers x402 payment middleware on a Fastify instance using a pre-configured resource server.
 *
 * Use this when you want to pass a pre-configured x402ResourceServer instance.
 * This provides more flexibility for testing, custom configuration, and reusing
 * server instances across multiple middlewares.
 *
 * @param app - The Fastify instance
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 *
 * @example
 * ```typescript
 * import { paymentMiddleware } from "@x402/fastify";
 *
 * const server = new x402ResourceServer(myFacilitatorClient)
 *   .register(NETWORK, new ExactEvmScheme());
 *
 * paymentMiddleware(app, routes, server, paywallConfig);
 * ```
 */
export function paymentMiddleware(
  app: FastifyInstance,
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
): void {
  const httpServer = new x402HTTPResourceServer(server, routes);

  paymentMiddlewareFromHTTPServer(app, httpServer, paywallConfig, paywall, syncFacilitatorOnStart);
}

/**
 * Registers x402 payment middleware on a Fastify instance using configuration.
 *
 * Use this when you want to quickly set up middleware with simple configuration.
 * This function creates and configures the x402ResourceServer internally.
 *
 * @param app - The Fastify instance
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromConfig } from "@x402/fastify";
 *
 * paymentMiddlewareFromConfig(
 *   app,
 *   routes,
 *   myFacilitatorClient,
 *   [{ network: "eip155:8453", server: evmSchemeServer }],
 *   paywallConfig
 * );
 * ```
 */
export function paymentMiddlewareFromConfig(
  app: FastifyInstance,
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  schemes?: SchemeRegistration[],
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true,
): void {
  const ResourceServer = new x402ResourceServer(facilitatorClients);

  if (schemes) {
    for (const { network, server: schemeServer } of schemes) {
      ResourceServer.register(network, schemeServer);
    }
  }

  paymentMiddleware(app, routes, ResourceServer, paywallConfig, paywall, syncFacilitatorOnStart);
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

export { FastifyAdapter } from "./adapter";
