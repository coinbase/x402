

import { HTTPAdapter, HTTPRequestContext, PaywallConfig, x402HTTPResourceService, RoutesConfig, FacilitatorClient } from "@x402/core/server";
import { SchemeNetworkService, Network } from "@x402/core/types";
import { NextFunction, Request, Response } from "express";

/**
 * Express adapter implementation
 */
export class ExpressAdapter implements HTTPAdapter {
  constructor(private req: Request) { }

  getHeader(name: string): string | undefined {
    const value = this.req.header(name);
    return Array.isArray(value) ? value[0] : value;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return this.req.path;
  }

  getUrl(): string {
    return `${this.req.protocol}://${this.req.headers.host}${this.req.path}`;
  }

  getAcceptHeader(): string {
    return this.req.header('Accept') || '';
  }

  getUserAgent(): string {
    return this.req.header('User-Agent') || '';
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
  server: SchemeNetworkService;
}

/**
 * Express payment middleware for x402 protocol
 * 
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @returns Express middleware handler
 */
export function paymentMiddleware(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  schemes?: SchemeRegistration[],
  paywallConfig?: PaywallConfig,
  initializeOnStart: boolean = true
) {
  // Create the x402 HTTP server instance
  const server = new x402HTTPResourceService(routes, facilitatorClients);

  // Register all provided schemes
  if (schemes) {
    schemes.forEach(({ network, server: schemeServer }) => {
      server.registerScheme(network, schemeServer);
    });
  }

  if (initializeOnStart) {
    server.initialize();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Create adapter and context
    const adapter = new ExpressAdapter(req);
    const context: HTTPRequestContext = {
      adapter,
      path: req.path,
      method: req.method,
      paymentHeader: adapter.getHeader('payment-signature') || adapter.getHeader('x-payment'),
    };

    // Process payment requirement check
    const result = await server.processHTTPRequest(context, paywallConfig);

    // Handle the different result types
    switch (result.type) {
      case 'no-payment-required':
        // No payment needed, proceed directly to the route handler
        return next();

      case 'payment-error':
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

      case 'payment-verified':
        // Payment is valid, need to wrap response for settlement
        const { paymentPayload, requirements } = result;

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
          const settlementHeaders = await server.processSettlement(
            paymentPayload,
            requirements,
            res.statusCode
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
              error: 'Settlement failed',
              details: error instanceof Error ? error.message : 'Unknown error'
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

export type { PaymentRequired, PaymentRequirements, PaymentPayload, Network, SchemeNetworkService } from "@x402/core/types";