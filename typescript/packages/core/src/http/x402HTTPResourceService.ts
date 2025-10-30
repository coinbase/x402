import { FacilitatorClient, x402ResourceService } from "../server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from ".";
import {
  PaymentPayload,
  PaymentRequired,
  SettleResponse,
  Price,
  Network,
  PaymentRequirements,
} from "../types";

/**
 * Framework-agnostic HTTP adapter interface
 * Implementations provide framework-specific HTTP operations
 */
export interface HTTPAdapter {
  getHeader(name: string): string | undefined;
  getMethod(): string;
  getPath(): string;
  getUrl(): string;
  getAcceptHeader(): string;
  getUserAgent(): string;
}

/**
 * Paywall configuration for HTML responses
 */
export interface PaywallConfig {
  cdpClientKey?: string;
  appName?: string;
  appLogo?: string;
  sessionTokenEndpoint?: string;
  currentUrl?: string;
  testnet?: boolean;
}

/**
 * Route configuration for HTTP endpoints
 */
export interface RouteConfig {
  scheme: string;
  payTo: string;
  price: Price;
  network: Network;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;

  // HTTP-specific metadata
  resource?: string;
  description?: string;
  mimeType?: string;
  customPaywallHtml?: string;
  discoverable?: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;

  // Extensions
  extensions?: Record<string, unknown>;
}

/**
 * Routes configuration - maps path patterns to route configs
 */
export type RoutesConfig = Record<string, RouteConfig> | RouteConfig;

/**
 * Compiled route for efficient matching
 */
export interface CompiledRoute {
  verb: string;
  regex: RegExp;
  config: RouteConfig;
}

/**
 * HTTP request context that encapsulates all request data
 */
export interface HTTPRequestContext {
  adapter: HTTPAdapter;
  path: string;
  method: string;
  paymentHeader?: string;
}

/**
 * HTTP response instructions for the framework middleware
 */
export interface HTTPResponseInstructions {
  status: number;
  headers: Record<string, string>;
  body?: unknown; // e.g. Paywall for web browser requests, but could be any other type
  isHtml?: boolean; // e.g. if body is a paywall, then isHtml is true
}

/**
 * Result of processing an HTTP request for payment
 */
export type HTTPProcessResult =
  | { type: "no-payment-required" }
  | {
      type: "payment-verified";
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    }
  | { type: "payment-error"; response: HTTPResponseInstructions };

/**
 * HTTP-enhanced x402 resource server
 * Provides framework-agnostic HTTP protocol handling
 */
export class x402HTTPResourceService extends x402ResourceService {
  private compiledRoutes: CompiledRoute[] = [];

  /**
   * Creates a new x402HTTPResourceService instance.
   *
   * @param routes - Route configuration for payment-protected endpoints
   * @param facilitatorClients - Optional facilitator client(s) for payment processing
   */
  constructor(routes: RoutesConfig, facilitatorClients?: FacilitatorClient | FacilitatorClient[]) {
    super(facilitatorClients);

    // Handle both single route and multiple routes
    const normalizedRoutes =
      typeof routes === "object" && !("scheme" in routes)
        ? (routes as Record<string, RouteConfig>)
        : { "*": routes as RouteConfig };

    for (const [pattern, config] of Object.entries(normalizedRoutes)) {
      const parsed = this.parseRoutePattern(pattern);
      this.compiledRoutes.push({
        verb: parsed.verb,
        regex: parsed.regex,
        config,
      });
    }
  }

  /**
   * Process HTTP request and return response instructions
   * This is the main entry point for framework middleware
   *
   * @param context - HTTP request context
   * @param paywallConfig - Optional paywall configuration
   * @returns Process result indicating next action for middleware
   */
  async processHTTPRequest(
    context: HTTPRequestContext,
    paywallConfig?: PaywallConfig,
  ): Promise<HTTPProcessResult> {
    const { adapter, path, method } = context;

    // Find matching route
    const routeConfig = this.getRouteConfig(path, method);
    if (!routeConfig) {
      return { type: "no-payment-required" }; // No payment required for this route
    }

    // Check for payment header (v1 or v2)
    const paymentPayload = this.extractPayment(adapter);

    // Create resource info first
    const resourceInfo = {
      url: context.adapter.getUrl(),
      description: routeConfig.description || "",
      mimeType: routeConfig.mimeType || "",
    };

    // Build payment requirements from route config
    const requirements = await this.buildPaymentRequirements(routeConfig);

    // Add resource URL to all payment requirements for discovery
    requirements.forEach(req => {
      if (!req.extra) {
        req.extra = {};
      }
      req.extra.resourceUrl = resourceInfo.url;
    });

    const paymentRequired = this.createPaymentRequiredResponse(
      requirements,
      resourceInfo,
      !paymentPayload ? "Payment required" : undefined,
      routeConfig.extensions,
    );

    // If no payment provided
    if (!paymentPayload) {
      return {
        type: "payment-error",
        response: this.createHTTPResponse(
          paymentRequired,
          this.isWebBrowser(adapter),
          paywallConfig,
          routeConfig.customPaywallHtml,
        ),
      };
    }

    // Verify payment
    try {
      const matchingRequirements = this.findMatchingRequirements(
        paymentRequired.accepts,
        paymentPayload,
      );

      if (!matchingRequirements) {
        const errorResponse = this.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          "No matching payment requirements",
          routeConfig.extensions,
        );
        return {
          type: "payment-error",
          response: this.createHTTPResponse(errorResponse, false, paywallConfig),
        };
      }

      const verifyResult = await this.verifyPayment(paymentPayload, matchingRequirements);

      if (!verifyResult.isValid) {
        const errorResponse = this.createPaymentRequiredResponse(
          requirements,
          resourceInfo,
          verifyResult.invalidReason,
          routeConfig.extensions,
        );
        return {
          type: "payment-error",
          response: this.createHTTPResponse(errorResponse, false, paywallConfig),
        };
      }

      // Payment is valid, return data needed for settlement
      return {
        type: "payment-verified",
        paymentPayload,
        paymentRequirements: matchingRequirements,
      };
    } catch (error) {
      const errorResponse = this.createPaymentRequiredResponse(
        requirements,
        resourceInfo,
        error instanceof Error ? error.message : "Payment verification failed",
        routeConfig.extensions,
      );
      return {
        type: "payment-error",
        response: this.createHTTPResponse(errorResponse, false, paywallConfig),
      };
    }
  }

  /**
   * Process settlement after successful response
   *
   * @param paymentPayload - The verified payment payload
   * @param requirements - The matching payment requirements
   * @param responseStatus - Status code from protected resource
   * @returns Settlement response headers or null
   */
  async processSettlement(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements,
    responseStatus: number,
  ): Promise<Record<string, string> | null> {
    // Don't settle if response failed
    if (responseStatus >= 400) {
      return null;
    }

    try {
      const settleResult = await this.settlePayment(paymentPayload, requirements);
      return this.createSettlementHeaders(settleResult);
    } catch (error) {
      console.error("Settlement failed:", error);
      throw error;
    }
  }

  /**
   * Get route configuration for a request
   *
   * @param path - Request path
   * @param method - HTTP method
   * @returns Route configuration or undefined if no match
   */
  private getRouteConfig(path: string, method: string): RouteConfig | undefined {
    const normalizedPath = this.normalizePath(path);
    const upperMethod = method.toUpperCase();

    const matchingRoute = this.compiledRoutes.find(
      route =>
        route.regex.test(normalizedPath) && (route.verb === "*" || route.verb === upperMethod),
    );

    return matchingRoute?.config;
  }

  /**
   * Extract payment from HTTP headers (handles v1 and v2)
   *
   * @param adapter - HTTP adapter
   * @returns Decoded payment payload or null
   */
  private extractPayment(adapter: HTTPAdapter): PaymentPayload | null {
    // Check v2 header first (PAYMENT-SIGNATURE)
    const header = adapter.getHeader("payment-signature") || adapter.getHeader("PAYMENT-SIGNATURE");

    if (header) {
      try {
        return decodePaymentSignatureHeader(header);
      } catch (error) {
        console.warn("Failed to decode PAYMENT-SIGNATURE header:", error);
      }
    }

    return null;
  }

  /**
   * Check if request is from a web browser
   *
   * @param adapter - HTTP adapter
   * @returns True if request appears to be from a browser
   */
  private isWebBrowser(adapter: HTTPAdapter): boolean {
    const accept = adapter.getAcceptHeader();
    const userAgent = adapter.getUserAgent();
    return accept.includes("text/html") && userAgent.includes("Mozilla");
  }

  /**
   * Create HTTP response instructions from payment required
   *
   * @param paymentRequired - Payment requirements
   * @param isWebBrowser - Whether request is from browser
   * @param paywallConfig - Paywall configuration
   * @param customHtml - Custom HTML template
   * @returns Response instructions
   */
  private createHTTPResponse(
    paymentRequired: PaymentRequired,
    isWebBrowser: boolean,
    paywallConfig?: PaywallConfig,
    customHtml?: string,
  ): HTTPResponseInstructions {
    if (isWebBrowser) {
      const html = this.generatePaywallHTML(paymentRequired, paywallConfig, customHtml);
      return {
        status: 402,
        headers: { "Content-Type": "text/html" },
        body: html,
        isHtml: true,
      };
    }

    const response = this.createHTTPPaymentRequiredResponse(paymentRequired);
    return {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        ...response.headers,
      },
    };
  }

  /**
   * Create HTTP payment required response (v1 puts in body, v2 puts in header)
   *
   * @param paymentRequired - Payment required object
   * @returns Headers and body for the HTTP response
   */
  private createHTTPPaymentRequiredResponse(paymentRequired: PaymentRequired): {
    headers: Record<string, string>;
  } {
    return {
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredHeader(paymentRequired),
      },
    };
  }

  /**
   * Create settlement response headers
   *
   * @param settleResponse - Settlement response
   * @returns Headers to add to response
   */
  private createSettlementHeaders(settleResponse: SettleResponse): Record<string, string> {
    const encoded = encodePaymentResponseHeader(settleResponse);
    return { "PAYMENT-RESPONSE": encoded };
  }

  /**
   * Parse route pattern into verb and regex
   *
   * @param pattern - Route pattern like "GET /api/*" or "/api/[id]"
   * @returns Parsed pattern with verb and regex
   */
  private parseRoutePattern(pattern: string): { verb: string; regex: RegExp } {
    const [verb, path] = pattern.includes(" ") ? pattern.split(/\s+/) : ["*", pattern];

    const regex = new RegExp(
      `^${
        path
          .replace(/[$()+.?^{|}]/g, "\\$&") // Escape regex special chars
          .replace(/\*/g, ".*?") // Wildcards
          .replace(/\[([^\]]+)\]/g, "[^/]+") // Parameters
          .replace(/\//g, "\\/") // Escape slashes
      }$`,
      "i",
    );

    return { verb: verb.toUpperCase(), regex };
  }

  /**
   * Normalize path for matching
   *
   * @param path - Raw path from request
   * @returns Normalized path
   */
  private normalizePath(path: string): string {
    try {
      const pathWithoutQuery = path.split(/[?#]/)[0];
      const decodedPath = decodeURIComponent(pathWithoutQuery);
      return decodedPath
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(/(.+?)\/+$/, "$1");
    } catch {
      return path;
    }
  }

  /**
   * Generate paywall HTML for browser requests
   *
   * @param paymentRequired - Payment required response
   * @param paywallConfig - Optional paywall configuration
   * @param customHtml - Optional custom HTML template
   * @returns HTML string
   */
  private generatePaywallHTML(
    paymentRequired: PaymentRequired,
    paywallConfig?: PaywallConfig,
    customHtml?: string,
  ): string {
    if (customHtml) {
      return customHtml;
    }

    // Try to use @x402/paywall if available (optional dependency)
    try {
      // @ts-ignore - Optional dependency
      const { getPaywallHtml } = require("@x402/paywall");
      
      const displayAmount = this.getDisplayAmount(paymentRequired);
      const resource = paymentRequired.resource;
      
      return getPaywallHtml({
        amount: displayAmount,
        paymentRequirements: paymentRequired.accepts,
        currentUrl: resource?.url || paywallConfig?.currentUrl || "",
        testnet: paywallConfig?.testnet ?? true,
        cdpClientKey: paywallConfig?.cdpClientKey,
        appName: paywallConfig?.appName,
        appLogo: paywallConfig?.appLogo,
        sessionTokenEndpoint: paywallConfig?.sessionTokenEndpoint,
      });
    } catch (error) {
      // @x402/paywall not installed, fall back to basic HTML
    }

    // Fallback: Basic HTML paywall
    const resource = paymentRequired.resource;
    const displayAmount = this.getDisplayAmount(paymentRequired);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Required</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
          <div style="max-width: 600px; margin: 50px auto; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
            ${paywallConfig?.appLogo ? `<img src="${paywallConfig.appLogo}" alt="${paywallConfig.appName || "App"}" style="max-width: 200px; margin-bottom: 20px;">` : ""}
            <h1>Payment Required</h1>
            ${resource ? `<p><strong>Resource:</strong> ${resource.description || resource.url}</p>` : ""}
            <p><strong>Amount:</strong> $${displayAmount.toFixed(2)} USDC</p>
            <div id="payment-widget" 
                 data-requirements='${JSON.stringify(paymentRequired)}'
                 data-cdp-client-key="${paywallConfig?.cdpClientKey || ""}"
                 data-app-name="${paywallConfig?.appName || ""}"
                 data-testnet="${paywallConfig?.testnet || false}">
              <!-- Install @x402/paywall for full wallet integration -->
              <p style="margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem;">
                <strong>Note:</strong> Install <code>@x402/paywall</code> for full wallet connection and payment UI.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Extract display amount from payment requirements.
   *
   * @param paymentRequired - The payment required object
   * @returns The display amount in decimal format
   */
  private getDisplayAmount(paymentRequired: PaymentRequired): number {
    const accepts = paymentRequired.accepts;
    if (accepts && accepts.length > 0) {
      const firstReq = accepts[0];
      if ("amount" in firstReq) {
        // V2 format
        return parseFloat(firstReq.amount) / 1000000; // Assuming USDC with 6 decimals
      }
    }
    return 0;
  }
}
