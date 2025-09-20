import { Context, Middleware, Next } from "koa";
import { Address, getAddress } from "viem";
import { Address as SolanaAddress } from "@solana/kit";
import { exact } from "x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  getPaywallHtml,
  processPriceToAtomicAmount,
  toJsonSafe,
} from "x402/shared";
import {
  FacilitatorConfig,
  ERC20TokenAmount,
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  PaywallConfig,
  Resource,
  RoutesConfig,
  settleResponseHeader,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "x402/types";
import { useFacilitator } from "x402/verify";

/**
 * Creates a payment middleware factory for Koa
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @returns A Koa middleware function
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
 *     url: 'https://facilitator.example.com',
 *     createAuthHeaders: async () => ({
 *       verify: { "Authorization": "Bearer token" },
 *       settle: { "Authorization": "Bearer token" }
 *     })
 *   },
 *   {
 *     cdpClientKey: 'your-cdp-client-key',
 *     appLogo: '/images/logo.svg',
 *     appName: 'My App',
 *   }
 * ));
 * ```
 */
export function paymentMiddleware(
  payTo: Address | SolanaAddress,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
): Middleware {
  const { verify, settle, supported } = useFacilitator(facilitator);
  const x402Version = 1;

  // Pre-compile route patterns to regex and extract verbs
  const routePatterns = computeRoutePatterns(routes);

  return async function paymentMiddleware(ctx: Context, next: Next): Promise<void> {
    const matchingRoute = findMatchingRoute(routePatterns, ctx.path, ctx.method.toUpperCase());

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
      discoverable,
    } = config;

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl: Resource =
      resource || (`${ctx.protocol}://${ctx.headers.host}${ctx.path}` as Resource);

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
        mimeType: mimeType ?? "",
        payTo: getAddress(payTo),
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
        asset: getAddress(asset.address),
        // TODO: Rename outputSchema to requestStructure
        outputSchema: {
          input: {
            type: "http",
            method: ctx.method.toUpperCase(),
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
      // get the supported payments from the facilitator
      const paymentKinds = await supported();

      // find the payment kind that matches the network and scheme
      let feePayer: string | undefined;
      for (const kind of paymentKinds.kinds) {
        if (kind.network === network && kind.scheme === "exact") {
          feePayer = kind?.extra?.feePayer;
          break;
        }
      }

      // if no fee payer is found, throw an error
      if (!feePayer) {
        throw new Error(`The facilitator did not provide a fee payer for network: ${network}.`);
      }

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
            method: ctx.method.toUpperCase(),
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

    const payment = ctx.header["x-payment"];
    const userAgent = ctx.header["user-agent"] || "";
    const acceptHeader = ctx.header["accept"] || "";
    const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      // TODO handle paywall html for solana
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

        const html =
          customPaywallHtml ||
          getPaywallHtml({
            amount: displayAmount,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl: ctx.originalUrl,
            testnet: network === "base-sepolia",
            cdpClientKey: paywall?.cdpClientKey,
            appName: paywall?.appName,
            appLogo: paywall?.appLogo,
            sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
          });
        ctx.status = 402;
        ctx.body = html;
        ctx.type = "text/html";
        return;
      }
      ctx.status = 402;
      ctx.body = {
        x402Version,
        error: "X-PAYMENT header is required",
        accepts: toJsonSafe(paymentRequirements),
      };
      return;
    }

    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(payment);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
      console.error(error);
      ctx.status = 402;
      ctx.body = {
        x402Version,
        error: error || "Invalid or malformed payment header",
        accepts: toJsonSafe(paymentRequirements),
      };
      return;
    }

    const selectedPaymentRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment,
    );
    if (!selectedPaymentRequirements) {
      ctx.status = 402;
      ctx.body = {
        x402Version,
        error: "Unable to find matching payment requirements",
        accepts: toJsonSafe(paymentRequirements),
      };
      return;
    }

    try {
      const response = await verify(decodedPayment, selectedPaymentRequirements);
      if (!response.isValid) {
        ctx.status = 402;
        ctx.body = {
          x402Version,
          error: response.invalidReason,
          accepts: toJsonSafe(paymentRequirements),
          payer: response.payer,
        };
        return;
      }
    } catch (error) {
      console.error(error);
      ctx.status = 402;
      ctx.body = {
        x402Version,
        error,
        accepts: toJsonSafe(paymentRequirements),
      };
      return;
    }

    // Store the original response body
    let originalBody: any;
    let statusCodeAfterNext: number;

    // Override ctx.body setter to capture the response
    const originalBodySetter = Object.getOwnPropertyDescriptor(ctx, "body")?.set;
    Object.defineProperty(ctx, "body", {
      get() {
        return originalBody;
      },
      set(value) {
        originalBody = value;
      },
      configurable: true,
    });

    // Proceed to the next middleware or route handler
    await next();
    
    // Capture the status code after next() completes
    statusCodeAfterNext = ctx.status;

    // Restore original body setter
    if (originalBodySetter) {
      Object.defineProperty(ctx, "body", {
        set: originalBodySetter,
        configurable: true,
      });
    }

    // If the response from the protected route is >= 400, do not settle payment
    if (statusCodeAfterNext >= 400) {
      ctx.body = originalBody;
      return;
    }

    try {
      const settleResponse = await settle(decodedPayment, selectedPaymentRequirements);
      const responseHeader = settleResponseHeader(settleResponse);
      ctx.set("X-PAYMENT-RESPONSE", responseHeader);

      // if the settle fails, return an error
      if (!settleResponse.success) {
        ctx.status = 402;
        ctx.body = {
          x402Version,
          error: settleResponse.errorReason,
          accepts: toJsonSafe(paymentRequirements),
        };
        return;
      }

      // Set the successful response body
      ctx.body = originalBody;
    } catch (error) {
      console.error(error);
      // If settlement fails and the response hasn't been sent yet, return an error
      ctx.status = 402;
      ctx.body = {
        x402Version,
        error,
        accepts: toJsonSafe(paymentRequirements),
      };
    }
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