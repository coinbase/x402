import type { Context } from "hono";
import { Address, getAddress } from "viem";
import { Address as SolanaAddress } from "@solana/kit";
import { exact } from "x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  toJsonSafe,
} from "x402/shared";
import { getPaywallHtml } from "x402/paywall";
import {
  ERC20TokenAmount,
  FacilitatorConfig,
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  Resource,
  RoutesConfig,
  settleResponseHeader,
  PaywallConfig,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "x402/types";
import { useFacilitator } from "x402/verify";

export interface PaymentMiddlewareOptions {
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
  /**
   * Controls when payment settlement occurs relative to the request handler.
   * 
   * - 'after' (default): Verifies payment, executes handler, then settles. Lower latency but creates
   *   an authorization replay risk window where multiple concurrent requests can execute with the same
   *   signed payment authorization before settlement confirms payment on-chain.
   * 
   * - 'before': Settles payment on-chain first, then executes handler. Eliminates authorization replay
   *   risk but adds blockchain confirmation latency to every request.
   * 
   * Use 'before' for endpoints that perform irreversible side effects (token issuance, account creation,
   * inventory updates). Use 'after' for read-only or idempotent endpoints.
   */
  settlementTiming?: 'before' | 'after';
}

/**
 * Creates a payment middleware factory for Hono
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param options - Optional configuration including facilitator, paywall, and settlement timing
 * @returns A Hono middleware handler
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
 * app.use(paymentMiddleware('0x123...', // payTo: The address to receive payments
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
 *     facilitator: {
 *       url: 'https://facilitator.example.com',
 *       createAuthHeaders: async () => ({
 *         verify: { "Authorization": "Bearer token" },
 *         settle: { "Authorization": "Bearer token" }
 *       })
 *     },
 *     paywall: {
 *       cdpClientKey: 'your-cdp-client-key',
 *       appLogo: '/images/logo.svg',
 *       appName: 'My App',
 *     },
 *     settlementTiming: 'before' // Settle before handler for critical operations
 *   }
 * ));
 * ```
 */
export function paymentMiddleware(
  payTo: Address | SolanaAddress,
  routes: RoutesConfig,
  facilitatorOrOptions?: FacilitatorConfig | PaymentMiddlewareOptions,
  paywall?: PaywallConfig,
) {
  // Handle both old and new API signatures for backward compatibility
  let facilitator: FacilitatorConfig | undefined;
  let paywallConfig: PaywallConfig | undefined;
  let settlementTiming: 'before' | 'after' = 'after';

  if (facilitatorOrOptions && typeof facilitatorOrOptions === 'object' && 'facilitator' in facilitatorOrOptions) {
    // New API with options object
    facilitator = facilitatorOrOptions.facilitator;
    paywallConfig = facilitatorOrOptions.paywall;
    settlementTiming = facilitatorOrOptions.settlementTiming ?? 'after';
  } else {
    // Legacy API: third param is facilitator, fourth is paywall
    facilitator = facilitatorOrOptions as FacilitatorConfig | undefined;
    paywallConfig = paywall;
  }

  const { verify, settle, supported } = useFacilitator(facilitator);
  const x402Version = 1;

  // Pre-compile route patterns to regex and extract verbs
  const routePatterns = computeRoutePatterns(routes);

  return async function paymentMiddleware(c: Context, next: () => Promise<void>) {
    const method = c.req.method.toUpperCase();
    const matchingRoute = findMatchingRoute(routePatterns, c.req.path, method);
    if (!matchingRoute) {
      return next();
    }

    const { price, network, config = {} } = matchingRoute.config;
    const {
      description,
      mimeType,
      maxTimeoutSeconds,
      inputSchema,
      outputSchema,
      customPaywallHtml,
      resource,
      errorMessages,
      discoverable,
    } = config;

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl: Resource = resource || (c.req.url as Resource);

    let paymentRequirements: PaymentRequirements[] = [];

    // TODO: create a shared middleware function to build payment requirements
    // evm networks
    if (SupportedEVMNetworks.includes(network)) {
      paymentRequirements.push({
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "application/json",
        payTo: getAddress(payTo),
        maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
        asset: getAddress(asset.address),
        // TODO: Rename outputSchema to requestStructure
        outputSchema: {
          input: {
            type: "http",
            method,
            discoverable: discoverable ?? true,
            ...inputSchema,
          },
          output: outputSchema,
        },
        extra: (asset as ERC20TokenAmount["asset"]).eip712,
      });
    }
    // svm networks
    else if (SupportedSVMNetworks.includes(network)) {
      // network call to get the supported payments from the facilitator
      const paymentKinds = await supported();

      // find the payment kind that matches the network and scheme
      let feePayer: string | undefined;
      for (const kind of paymentKinds.kinds) {
        if (kind.network === network && kind.scheme === "exact") {
          feePayer = kind?.extra?.feePayer;
          break;
        }
      }

      // svm networks require a fee payer
      if (!feePayer) {
        throw new Error(`The facilitator did not provide a fee payer for network: ${network}.`);
      }

      // build the payment requirements for svm
      paymentRequirements.push({
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "",
        payTo: payTo,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
        asset: asset.address,
        // TODO: Rename outputSchema to requestStructure
        outputSchema: {
          input: {
            type: "http",
            method,
            discoverable: discoverable ?? true,
            ...inputSchema,
          },
          output: outputSchema,
        },
        extra: {
          feePayer,
        },
      });
    } else {
      throw new Error(`Unsupported network: ${network}`);
    }

    const payment = c.req.header("X-PAYMENT");
    const userAgent = c.req.header("User-Agent") || "";
    const acceptHeader = c.req.header("Accept") || "";
    const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      // TODO: handle paywall html for solana
      if (isWebBrowser) {
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

        const currentUrl = new URL(c.req.url).pathname + new URL(c.req.url).search;
        const html =
          customPaywallHtml ??
          getPaywallHtml({
            amount: displayAmount,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl,
            testnet: network === "base-sepolia",
            cdpClientKey: paywallConfig?.cdpClientKey,
            appName: paywallConfig?.appName,
            appLogo: paywallConfig?.appLogo,
            sessionTokenEndpoint: paywallConfig?.sessionTokenEndpoint,
          });
        return c.html(html, 402);
      }
      return c.json(
        {
          error: errorMessages?.paymentRequired || "X-PAYMENT header is required",
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }

    // Verify payment
    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(payment);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
      return c.json(
        {
          error:
            errorMessages?.invalidPayment ||
            (error instanceof Error ? error : new Error("Invalid or malformed payment header")),
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }

    const selectedPaymentRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment,
    );
    if (!selectedPaymentRequirements) {
      return c.json(
        {
          error:
            errorMessages?.noMatchingRequirements || "Unable to find matching payment requirements",
          accepts: toJsonSafe(paymentRequirements),
          x402Version,
        },
        402,
      );
    }

    // Verify the payment authorization signature and requirements
    const verification = await verify(decodedPayment, selectedPaymentRequirements);

    if (!verification.isValid) {
      return c.json(
        {
          error: errorMessages?.verificationFailed || verification.invalidReason,
          accepts: paymentRequirements,
          payer: verification.payer,
          x402Version,
        },
        402,
      );
    }

    // IMPORTANT: Authorization Replay Risk
    // At this point, the payment authorization is cryptographically valid but NOT yet settled on-chain.
    // Multiple concurrent requests can pass verification using the same signed authorization before
    // settlement confirms the payment. This creates a window where side effects (token minting, account
    // creation, inventory updates) could execute multiple times for a single payment.
    //
    // To eliminate this risk for critical operations, use settlementTiming: 'before' in the middleware
    // configuration. This settles the payment on-chain BEFORE executing your handler, ensuring the
    // payment is confirmed before any side effects occur.
    //
    // For read-only or idempotent endpoints, the default 'after' timing provides lower latency.

    if (settlementTiming === 'before') {
      // Settle payment BEFORE executing the handler to eliminate authorization replay risk
      try {
        const settlement = await settle(decodedPayment, selectedPaymentRequirements);
        if (settlement.success) {
          const responseHeader = settleResponseHeader(settlement);
          c.res.headers.set("X-PAYMENT-RESPONSE", responseHeader);
        } else {
          throw new Error(settlement.errorReason);
        }
      } catch (error) {
        return c.json(
          {
            error:
              errorMessages?.settlementFailed ||
              (error instanceof Error ? error : new Error("Failed to settle payment")),
            accepts: paymentRequirements,
            x402Version,
          },
          402,
        );
      }

      // Payment is now confirmed on-chain, safe to proceed with handler
      return next();
    }

    // Default 'after' settlement timing: verify → execute handler → settle
    // This provides lower latency but creates an authorization replay risk window
    // Proceed with request
    await next();

    let res = c.res;

    // If the response from the protected route is >= 400, do not settle payment
    if (res.status >= 400) {
      return;
    }

    c.res = undefined;

    // Settle payment before processing the request, as Hono middleware does not allow us to set headers after the response has been sent
    try {
      const settlement = await settle(decodedPayment, selectedPaymentRequirements);
      if (settlement.success) {
        const responseHeader = settleResponseHeader(settlement);
        res.headers.set("X-PAYMENT-RESPONSE", responseHeader);
      } else {
        throw new Error(settlement.errorReason);
      }
    } catch (error) {
      res = c.json(
        {
          error:
            errorMessages?.settlementFailed ||
            (error instanceof Error ? error : new Error("Failed to settle payment")),
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }

    c.res = res;
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
export type { Address as SolanaAddress } from "@solana/kit";
