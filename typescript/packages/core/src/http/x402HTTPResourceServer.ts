import { x402ResourceServer } from "../server";
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
import { x402Version } from "..";

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

  /**
   * Get query parameters from the request URL
   *
   * @returns Record of query parameter key-value pairs
   */
  getQueryParams?(): Record<string, string | string[]>;

  /**
   * Get a specific query parameter by name
   *
   * @param name - The query parameter name
   * @returns The query parameter value(s) or undefined
   */
  getQueryParam?(name: string): string | string[] | undefined;

  /**
   * Get the parsed request body
   * Framework adapters should parse JSON/form data appropriately
   *
   * @returns The parsed request body
   */
  getBody?(): unknown;
}

/**
 * Paywall configuration for HTML responses
 */
export interface PaywallConfig {
  appName?: string;
  appLogo?: string;
  sessionTokenEndpoint?: string;
  currentUrl?: string;
  testnet?: boolean;
}

/**
 * Paywall provider interface for generating HTML
 */
export interface PaywallProvider {
  generateHtml(paymentRequired: PaymentRequired, config?: PaywallConfig): string;
}

/**
 * Dynamic payTo function that receives HTTP request context
 */
export type DynamicPayTo = (context: HTTPRequestContext) => string | Promise<string>;

/**
 * Dynamic price function that receives HTTP request context
 */
export type DynamicPrice = (context: HTTPRequestContext) => Price | Promise<Price>;

/**
 * Result of the unpaid response callback containing content type and body.
 */
export interface UnpaidResponseResult {
  /**
   * The content type for the response (e.g., 'application/json', 'text/plain').
   */
  contentType: string;

  /**
   * The response body to include in the 402 response.
   */
  body: unknown;
}

/**
 * Dynamic function to generate a custom response for unpaid requests.
 * Receives the HTTP request context and returns the content type and body to include in the 402 response.
 */
export type UnpaidResponseBody = (
  context: HTTPRequestContext,
) => UnpaidResponseResult | Promise<UnpaidResponseResult>;

/**
 * A single payment option for a route
 * Represents one way a client can pay for access to the resource
 */
export interface PaymentOption {
  scheme: string;
  payTo: string | DynamicPayTo;
  price: Price | DynamicPrice;
  network: Network;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

/**
 * Route configuration for HTTP endpoints
 *
 * The 'accepts' field defines payment options for the route.
 * Can be a single PaymentOption or an array of PaymentOptions for multiple payment methods.
 */
export interface RouteConfig {
  // Payment option(s): single or array
  accepts: PaymentOption | PaymentOption[];

  // HTTP-specific metadata
  resource?: string;
  description?: string;
  mimeType?: string;
  customPaywallHtml?: string;

  /**
   * Optional callback to generate a custom response for unpaid API requests.
   * This allows servers to return preview data, error messages, or other content
   * when a request lacks payment.
   *
   * For browser requests (Accept: text/html), the paywall HTML takes precedence.
   * This callback is only used for API clients.
   *
   * If not provided, defaults to { contentType: 'application/json', body: {} }.
   *
   * @param context - The HTTP request context
   * @returns An object containing both contentType and body for the 402 response
   */
  unpaidResponseBody?: UnpaidResponseBody;

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
 * Result of processSettlement
 */
export type ProcessSettleSuccessResponse = SettleResponse & {
  success: true;
  headers: Record<string, string>;
  requirements: PaymentRequirements;
};

export type ProcessSettleFailureResponse = SettleResponse & {
  success: false;
  errorReason: string;
};

export type ProcessSettleResultResponse =
  | ProcessSettleSuccessResponse
  | ProcessSettleFailureResponse;

/**
 * Represents a validation error for a specific route's payment configuration.
 */
export interface RouteValidationError {
  /** The route pattern (e.g., "GET /api/weather") */
  routePattern: string;
  /** The payment scheme that failed validation */
  scheme: string;
  /** The network that failed validation */
  network: Network;
  /** The type of validation failure */
  reason: "missing_scheme" | "missing_facilitator";
  /** Human-readable error message */
  message: string;
}

/**
 * Error thrown when route configuration validation fails.
 */
export class RouteConfigurationError extends Error {
  /** The validation errors that caused this exception */
  public readonly errors: RouteValidationError[];

  /**
   * Creates a new RouteConfigurationError with the given validation errors.
   *
   * @param errors - The validation errors that caused this exception.
   */
  constructor(errors: RouteValidationError[]) {
    const message = `x402 Route Configuration Errors:\n${errors.map(e => `  - ${e.message}`).join("\n")}`;
    super(message);
    this.name = "RouteConfigurationError";
    this.errors = errors;
  }
}

/**
 * HTTP-enhanced x402 resource server
 * Provides framework-agnostic HTTP protocol handling
 */
export class x402HTTPResourceServer {
  private ResourceServer: x402ResourceServer;
  private compiledRoutes: CompiledRoute[] = [];
  private routesConfig: RoutesConfig;
  private paywallProvider?: PaywallProvider;

  /**
   * Creates a new x402HTTPResourceServer instance.
   *
   * @param ResourceServer - The core x402ResourceServer instance to use
   * @param routes - Route configuration for payment-protected endpoints
   */
  constructor(ResourceServer: x402ResourceServer, routes: RoutesConfig) {
    this.ResourceServer = ResourceServer;
    this.routesConfig = routes;

    // Handle both single route and multiple routes
    const normalizedRoutes =
      typeof routes === "object" && !("accepts" in routes)
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
   * Initialize the HTTP resource server.
   *
   * This method initializes the underlying resource server (fetching facilitator support)
   * and then validates that all route payment configurations have corresponding
   * registered schemes and facilitator support.
   *
   * @throws RouteConfigurationError if any route's payment options don't have
   *         corresponding registered schemes or facilitator support
   *
   * @example
   * ```typescript
   * const httpServer = new x402HTTPResourceServer(server, routes);
   * await httpServer.initialize();
   * ```
   */
  async initialize(): Promise<void> {
    // First, initialize the underlying resource server (fetches facilitator support)
    await this.ResourceServer.initialize();

    // Then validate route configuration
    const errors = this.validateRouteConfiguration();
    if (errors.length > 0) {
      throw new RouteConfigurationError(errors);
    }
  }

  /**
   * Register a custom paywall provider for generating HTML
   *
   * @param provider - PaywallProvider instance
   * @returns This service instance for chaining
   */
  registerPaywallProvider(provider: PaywallProvider): this {
    this.paywallProvider = provider;
    return this;
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

    // Normalize accepts field to array of payment options
    const paymentOptions = this.normalizePaymentOptions(routeConfig);

    // Check for payment header (v1 or v2)
    const paymentPayload = this.extractPayment(adapter);

    // Create resource info, using config override if provided
    const resourceInfo = {
      url: routeConfig.resource || context.adapter.getUrl(),
      description: routeConfig.description || "",
      mimeType: routeConfig.mimeType || "",
    };

    // Build requirements from all payment options
    // (this method handles resolving dynamic functions internally)
    const requirements = await this.ResourceServer.buildPaymentRequirementsFromOptions(
      paymentOptions,
      context,
    );

    let extensions = routeConfig.extensions;
    if (extensions) {
      extensions = this.ResourceServer.enrichExtensions(extensions, context);
    }

    const paymentRequired = this.ResourceServer.createPaymentRequiredResponse(
      requirements,
      resourceInfo,
      !paymentPayload ? "Payment required" : undefined,
      extensions,
    );

    // If no payment provided
    if (!paymentPayload) {
      // Resolve custom unpaid response body if provided
      const unpaidBody = routeConfig.unpaidResponseBody
        ? await routeConfig.unpaidResponseBody(context)
        : undefined;

      return {
        type: "payment-error",
        response: this.createHTTPResponse(
          paymentRequired,
          this.isWebBrowser(adapter),
          paywallConfig,
          routeConfig.customPaywallHtml,
          unpaidBody,
        ),
      };
    }

    // Verify payment
    try {
      const matchingRequirements = this.ResourceServer.findMatchingRequirements(
        paymentRequired.accepts,
        paymentPayload,
      );

      if (!matchingRequirements) {
        const errorResponse = this.ResourceServer.createPaymentRequiredResponse(
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

      const verifyResult = await this.ResourceServer.verifyPayment(
        paymentPayload,
        matchingRequirements,
      );

      if (!verifyResult.isValid) {
        const errorResponse = this.ResourceServer.createPaymentRequiredResponse(
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
      const errorResponse = this.ResourceServer.createPaymentRequiredResponse(
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
   * @returns ProcessSettleResultResponse - SettleResponse with headers if success or errorReason if failure
   */
  async processSettlement(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<ProcessSettleResultResponse> {
    try {
      const settleResponse = await this.ResourceServer.settlePayment(paymentPayload, requirements);

      if (!settleResponse.success) {
        return {
          ...settleResponse,
          success: false,
          errorReason: settleResponse.errorReason || "Settlement failed",
        };
      }

      return {
        ...settleResponse,
        success: true,
        headers: this.createSettlementHeaders(settleResponse, requirements),
        requirements,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Settlement failed");
    }
  }

  /**
   * Check if a request requires payment based on route configuration
   *
   * @param context - HTTP request context
   * @returns True if the route requires payment, false otherwise
   */
  requiresPayment(context: HTTPRequestContext): boolean {
    const routeConfig = this.getRouteConfig(context.path, context.method);
    return routeConfig !== undefined;
  }

  /**
   * Normalizes a RouteConfig's accepts field into an array of PaymentOptions
   * Handles both single PaymentOption and array formats
   *
   * @param routeConfig - Route configuration
   * @returns Array of payment options
   */
  private normalizePaymentOptions(routeConfig: RouteConfig): PaymentOption[] {
    return Array.isArray(routeConfig.accepts) ? routeConfig.accepts : [routeConfig.accepts];
  }

  /**
   * Validates that all payment options in routes have corresponding registered schemes
   * and facilitator support.
   *
   * @returns Array of validation errors (empty if all routes are valid)
   */
  private validateRouteConfiguration(): RouteValidationError[] {
    const errors: RouteValidationError[] = [];

    // Normalize routes to array of [pattern, config] pairs
    const normalizedRoutes =
      typeof this.routesConfig === "object" && !("accepts" in this.routesConfig)
        ? Object.entries(this.routesConfig as Record<string, RouteConfig>)
        : [["*", this.routesConfig as RouteConfig] as [string, RouteConfig]];

    for (const [pattern, config] of normalizedRoutes) {
      const paymentOptions = this.normalizePaymentOptions(config);

      for (const option of paymentOptions) {
        // Check 1: Is scheme registered?
        if (!this.ResourceServer.hasRegisteredScheme(option.network, option.scheme)) {
          errors.push({
            routePattern: pattern,
            scheme: option.scheme,
            network: option.network,
            reason: "missing_scheme",
            message: `Route "${pattern}": No scheme implementation registered for "${option.scheme}" on network "${option.network}"`,
          });
          // Skip facilitator check if scheme isn't registered
          continue;
        }

        // Check 2: Does facilitator support this scheme/network combination?
        const supportedKind = this.ResourceServer.getSupportedKind(
          x402Version,
          option.network,
          option.scheme,
        );

        if (!supportedKind) {
          errors.push({
            routePattern: pattern,
            scheme: option.scheme,
            network: option.network,
            reason: "missing_facilitator",
            message: `Route "${pattern}": Facilitator does not support scheme "${option.scheme}" on network "${option.network}"`,
          });
        }
      }
    }

    return errors;
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
   * @param unpaidResponse - Optional custom response (content type and body) for unpaid API requests
   * @returns Response instructions
   */
  private createHTTPResponse(
    paymentRequired: PaymentRequired,
    isWebBrowser: boolean,
    paywallConfig?: PaywallConfig,
    customHtml?: string,
    unpaidResponse?: UnpaidResponseResult,
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

    // Use callback result if provided, otherwise default to JSON with empty object
    const contentType = unpaidResponse ? unpaidResponse.contentType : "application/json";
    const body = unpaidResponse ? unpaidResponse.body : {};

    return {
      status: 402,
      headers: {
        "Content-Type": contentType,
        ...response.headers,
      },
      body,
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
   * @param requirements - Payment requirements that were settled
   * @returns Headers to add to response
   */
  private createSettlementHeaders(
    settleResponse: SettleResponse,
    requirements: PaymentRequirements,
  ): Record<string, string> {
    const encoded = encodePaymentResponseHeader({
      ...settleResponse,
      requirements,
    });
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

    // Use custom paywall provider if set
    if (this.paywallProvider) {
      return this.paywallProvider.generateHtml(paymentRequired, paywallConfig);
    }

    // Try to use @x402/paywall if available (optional dependency)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const paywall = require("@x402/paywall");
      const displayAmount = this.getDisplayAmount(paymentRequired);
      const resource = paymentRequired.resource;

      return paywall.getPaywallHtml({
        amount: displayAmount,
        paymentRequired,
        currentUrl: resource?.url || paywallConfig?.currentUrl || "",
        testnet: paywallConfig?.testnet ?? true,
        appName: paywallConfig?.appName,
        appLogo: paywallConfig?.appLogo,
        sessionTokenEndpoint: paywallConfig?.sessionTokenEndpoint,
      });
    } catch {
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
