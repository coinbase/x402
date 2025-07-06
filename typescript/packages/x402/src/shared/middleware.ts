import { Address, Hex } from "viem";
import {
  moneySchema,
  Network,
  Price,
  RouteConfig,
  RoutePattern,
  ERC20TokenAmount,
  PaymentRequirements,
  PaymentPayload,
  FacilitatorConfig,
  PaywallConfig,
  PaymentOption,
} from "../types";
import { RoutesConfig } from "../types";
import { safeBase64Decode } from "./base64";
import { getUsdcAddressForChain } from "./evm";
import { getNetworkId } from "./network";
import { exact } from "../schemes";
import { getPaywallHtml } from "./paywall";
import { toJsonSafe } from "./json";
import { useFacilitator } from "../verify";
import { settleResponseHeader } from "../types";

/**
 * Computes the route patterns for the given routes config
 *
 * @param routes - The routes config to compute the patterns for
 * @returns The route patterns
 */
export function computeRoutePatterns(routes: RoutesConfig): RoutePattern[] {
  const normalizedRoutes = Object.fromEntries(
    Object.entries(routes).map(([pattern, value]) => [
      pattern,
      typeof value === "string" || typeof value === "number"
        ? ({ price: value, network: "base-sepolia" } as RouteConfig)
        : (value as RouteConfig),
    ]),
  );

  return Object.entries(normalizedRoutes).map(([pattern, routeConfig]) => {
    // Split pattern into verb and path, defaulting to "*" for verb if not specified
    const [verb, path] = pattern.includes(" ") ? pattern.split(/\s+/) : ["*", pattern];
    if (!path) {
      throw new Error(`Invalid route pattern: ${pattern}`);
    }
    return {
      verb: verb.toUpperCase(),
      pattern: new RegExp(
        `^${path
          .replace(/\*/g, ".*?") // Make wildcard non-greedy and optional
          .replace(/\[([^\]]+)\]/g, "[^/]+")
          .replace(/\//g, "\\/")}$`,
        "i",
      ),
      config: routeConfig,
    };
  });
}

/**
 * Finds the matching route pattern for the given path and method
 *
 * @param routePatterns - The route patterns to search through
 * @param path - The path to match against
 * @param method - The HTTP method to match against
 * @returns The matching route pattern or undefined if no match is found
 */
export function findMatchingRoute(
  routePatterns: RoutePattern[],
  path: string,
  method: string,
): RoutePattern | undefined {
  // Find matching route pattern
  const matchingRoutes = routePatterns.filter(({ pattern, verb }) => {
    const matchesPath = pattern.test(path);
    const matchesVerb = verb === "*" || verb === method.toUpperCase();
    return matchesPath && matchesVerb;
  });

  if (matchingRoutes.length === 0) {
    return undefined;
  }

  // Use the most specific route (longest path pattern)
  const matchingRoute = matchingRoutes.reduce((a, b) =>
    b.pattern.source.length > a.pattern.source.length ? b : a,
  );

  return matchingRoute;
}

/**
 * Gets the default asset (USDC) for the given network
 *
 * @param network - The network to get the default asset for
 * @returns The default asset
 */
export function getDefaultAsset(network: Network) {
  return {
    address: getUsdcAddressForChain(getNetworkId(network)),
    decimals: 6,
    eip712: {
      name: network === "base" ? "USD Coin" : network === "iotex" ? "Bridged USDC" : "USDC",
      version: "2",
    },
  };
}

/**
 * Parses the amount from the given price
 *
 * @param price - The price to parse
 * @param network - The network to get the default asset for
 * @returns The parsed amount or an error message
 */
export function processPriceToAtomicAmount(
  price: Price,
  network: Network,
): { maxAmountRequired: string; asset: ERC20TokenAmount["asset"] } | { error: string } {
  // Handle USDC amount (string) or token amount (ERC20TokenAmount)
  let maxAmountRequired: string;
  let asset: ERC20TokenAmount["asset"];

  if (typeof price === "string" || typeof price === "number") {
    // USDC amount in dollars
    const parsedAmount = moneySchema.safeParse(price);
    if (!parsedAmount.success) {
      return {
        error: `Invalid price (price: ${price}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`,
      };
    }
    const parsedUsdAmount = parsedAmount.data;
    asset = getDefaultAsset(network);
    maxAmountRequired = (parsedUsdAmount * 10 ** asset.decimals).toString();
  } else {
    // Token amount in atomic units
    maxAmountRequired = price.amount;
    asset = price.asset;
  }

  return {
    maxAmountRequired,
    asset,
  };
}

/**
 * Converts a route config to payment options
 *
 * @param routeConfig - The route config to convert
 * @returns Array of payment options
 */
export function routeConfigToPaymentOptions(routeConfig: RouteConfig): PaymentOption[] {
  const { price, network, prices } = routeConfig;

  // If prices array is provided, use it
  if (prices && prices.length > 0) {
    return prices;
  }

  // Backward compatibility: use price and network if provided
  if (price && network) {
    return [{ price, network }];
  }

  // Fallback to default if neither is provided
  return [];
}

/**
 * Finds the matching payment requirements for the given payment
 *
 * @param paymentRequirements - The payment requirements to search through
 * @param payment - The payment to match against
 * @returns The matching payment requirements or undefined if no match is found
 */
export function findMatchingPaymentRequirements(
  paymentRequirements: PaymentRequirements[],
  payment: PaymentPayload,
) {
  return paymentRequirements.find(
    value => value.scheme === payment.scheme && value.network === payment.network,
  );
}

/**
 * Decodes the X-PAYMENT-RESPONSE header
 *
 * @param header - The X-PAYMENT-RESPONSE header to decode
 * @returns The decoded payment response
 */
export function decodeXPaymentResponse(header: string) {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded) as {
    success: boolean;
    transaction: Hex;
    network: Network;
    payer: Address;
  };
}

/**
 * Core X402 middleware logic that can be used across different frameworks
 */
export class ExactEvmMiddleware {
  private routePatterns: RoutePattern[];
  private verify: ReturnType<typeof useFacilitator>["verify"];
  private settle: ReturnType<typeof useFacilitator>["settle"];
  private x402Version = 1;

  /**
   * Creates a new ExactEvmMiddleware instance
   *
   * @param payTo - The address to receive payments
   * @param routes - Configuration for protected routes and their payment requirements
   * @param facilitator - Optional configuration for the payment facilitator service
   * @param paywall - Optional configuration for the default paywall
   */
  constructor(
    private payTo: Address,
    routes: RoutesConfig,
    facilitator?: FacilitatorConfig,
    private paywall?: PaywallConfig,
  ) {
    this.routePatterns = computeRoutePatterns(routes);
    const facilitatorFunctions = useFacilitator(facilitator);
    this.verify = facilitatorFunctions.verify;
    this.settle = facilitatorFunctions.settle;
  }

  /**
   * Process a request and determine if payment is required
   *
   * @param path - The request path to check against configured routes
   * @param method - The HTTP method of the request
   * @param resourceUrl - Optional resource URL, defaults to path if not provided
   * @returns Object indicating whether payment is required and payment details if so
   */
  async processRequest(
    path: string,
    method: string,
    resourceUrl?: string,
  ): Promise<
    | { requiresPayment: false }
    | {
        requiresPayment: true;
        paymentRequirements: PaymentRequirements[];
        displayAmount: number;
        customPaywallHtml?: string;
        network: Network;
      }
  > {
    const matchingRoute = findMatchingRoute(this.routePatterns, path, method.toUpperCase());

    if (!matchingRoute) {
      return { requiresPayment: false };
    }

    const { config = {} } = matchingRoute.config;
    const { description, mimeType, maxTimeoutSeconds, outputSchema, customPaywallHtml, resource } =
      config;

    // Convert route config to payment options
    const paymentOptions = routeConfigToPaymentOptions(matchingRoute.config);

    // Process each payment option into payment requirements
    const paymentRequirements: PaymentRequirements[] = [];
    let displayAmount = 0;
    let primaryNetwork: Network = "base-sepolia";

    for (const { price, network } of paymentOptions) {
      const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
      if ("error" in atomicAmountForAsset) {
        throw new Error(atomicAmountForAsset.error);
      }
      const { maxAmountRequired, asset } = atomicAmountForAsset;

      const finalResourceUrl: string = resource || resourceUrl || path;

      paymentRequirements.push({
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: finalResourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "application/json",
        payTo: this.payTo,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
        asset: asset.address,
        outputSchema,
        extra: asset.eip712,
      });

      // Calculate display amount for paywall (use the first one as primary)
      if (paymentRequirements.length === 1) {
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
        primaryNetwork = network;
      }
    }

    return {
      requiresPayment: true,
      paymentRequirements,
      displayAmount,
      customPaywallHtml,
      network: primaryNetwork,
    };
  }

  /**
   * Generate paywall HTML for web browsers
   *
   * @param paymentRequirements - The payment requirements to display in the paywall
   * @param displayAmount - The amount to display in the paywall (in dollars)
   * @param currentUrl - The current URL where the paywall is being shown
   * @param network - The network for the payment
   * @param customPaywallHtml - Optional custom HTML to use instead of the default paywall
   * @returns HTML string for the paywall page
   */
  generatePaywallHtml(
    paymentRequirements: PaymentRequirements[],
    displayAmount: number,
    currentUrl: string,
    network: Network,
    customPaywallHtml?: string,
  ): string {
    return (
      customPaywallHtml ||
      getPaywallHtml({
        amount: displayAmount,
        paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
          typeof getPaywallHtml
        >[0]["paymentRequirements"],
        currentUrl,
        testnet: network === "base-sepolia",
        cdpClientKey: this.paywall?.cdpClientKey,
        appName: this.paywall?.appName,
        appLogo: this.paywall?.appLogo,
      })
    );
  }

  /**
   * Verify a payment header
   *
   * @param paymentHeader - The X-PAYMENT header value to verify
   * @param paymentRequirements - The payment requirements to verify against
   * @returns Object indicating verification success/failure and related details
   */
  async verifyPayment(
    paymentHeader: string,
    paymentRequirements: PaymentRequirements[],
  ): Promise<{
    success: boolean;
    decodedPayment?: PaymentPayload;
    selectedRequirements?: PaymentRequirements;
    error?: string;
    payer?: string;
  }> {
    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(paymentHeader);
      decodedPayment.x402Version = this.x402Version;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid or malformed payment header",
      };
    }

    const selectedPaymentRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment,
    );
    if (!selectedPaymentRequirements) {
      return {
        success: false,
        error: "Unable to find matching payment requirements",
      };
    }

    try {
      const response = await this.verify(decodedPayment, selectedPaymentRequirements);
      if (!response.isValid) {
        return {
          success: false,
          error: response.invalidReason,
          payer: response.payer,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }

    return {
      success: true,
      decodedPayment,
      selectedRequirements: selectedPaymentRequirements,
    };
  }

  /**
   * Settle a payment
   *
   * @param decodedPayment - The decoded payment payload to settle
   * @param selectedRequirements - The payment requirements that were selected for this payment
   * @returns Object indicating settlement success/failure and response header if successful
   */
  async settlePayment(
    decodedPayment: PaymentPayload,
    selectedRequirements: PaymentRequirements,
  ): Promise<{
    success: boolean;
    responseHeader?: string;
    error?: string;
  }> {
    try {
      const settleResponse = await this.settle(decodedPayment, selectedRequirements);
      const responseHeader = settleResponseHeader(settleResponse);
      return {
        success: true,
        responseHeader,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Settlement failed",
      };
    }
  }

  /**
   * Check if the request is from a web browser
   *
   * @param headers - The request headers to check for browser indicators
   * @returns True if the request appears to be from a web browser
   */
  isWebBrowser(headers: Record<string, string | string[] | undefined>): boolean {
    const userAgent = Array.isArray(headers["user-agent"])
      ? headers["user-agent"][0]
      : headers["user-agent"] || "";
    const acceptHeader = Array.isArray(headers["accept"])
      ? headers["accept"][0]
      : headers["accept"] || "";
    return acceptHeader.includes("text/html") && userAgent.includes("Mozilla");
  }

  /**
   * Create a standard error response
   *
   * @param error - The error message to include in the response
   * @param paymentRequirements - The payment requirements to include in the accepts array
   * @param payer - Optional payer address to include in the response
   * @returns Standardized error response object
   */
  createErrorResponse(
    error: string,
    paymentRequirements: PaymentRequirements[],
    payer?: string,
  ): {
    x402Version: number;
    error: string;
    accepts: object;
    payer?: string;
  } {
    return {
      x402Version: this.x402Version,
      error,
      accepts: toJsonSafe(paymentRequirements),
      ...(payer && { payer }),
    };
  }
}

/**
 * Creates a new ExactEvmMiddleware instance
 *
 * @param payTo - The address to receive payments
 * @param routes - The routes config to use
 * @param facilitator - Optional facilitator configuration
 * @param paywall - Optional paywall configuration
 * @returns A new ExactEvmMiddleware instance
 */
export function exactEvmMiddleware(
  payTo: Address,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
) {
  return new ExactEvmMiddleware(payTo, routes, facilitator, paywall);
}
