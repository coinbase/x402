import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Address, getAddress } from "viem";
import type { Address as SolanaAddress } from "@solana/kit";
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
  FacilitatorConfig,
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  Resource,
  RoutesConfig,
  PaywallConfig,
  ERC20TokenAmount,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { safeBase64Encode } from "x402/shared";

import { POST } from "./api/session-token";

/**
 * Creates a payment middleware factory for Next.js
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @returns A Next.js middleware handler
 *
 * @example
 * ```typescript
 * // Simple configuration - All endpoints are protected by $0.01 of USDC on base-sepolia
 * export const middleware = paymentMiddleware(
 *   '0x123...', // payTo address
 *   {
 *     price: '$0.01', // USDC amount in dollars
 *     network: 'base-sepolia'
 *   },
 *   // Optional facilitator configuration. Defaults to x402.org/facilitator for testnet usage
 * );
 *
 * // Advanced configuration - Endpoint-specific payment requirements & custom facilitator
 * export const middleware = paymentMiddleware(
 *   '0x123...', // payTo: The address to receive payments
 *   {
 *     '/protected/*': {
 *       price: '$0.001', // USDC amount in dollars
 *       network: 'base',
 *       config: {
 *         description: 'Access to protected content'
 *       }
 *     },
 *     '/api/premium/*': {
 *       price: {
 *         amount: '100000',
 *         asset: {
 *           address: '0xabc',
 *           decimals: 18,
 *           eip712: {
 *             name: 'WETH',
 *             version: '1'
 *           }
 *         }
 *       },
 *       network: 'base'
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
 * );
 * ```
 */
export function paymentMiddleware(
  payTo: Address | SolanaAddress,
  routes: RoutesConfig,
  facilitator?: FacilitatorConfig,
  paywall?: PaywallConfig,
) {
  const { verify, settle, supported } = useFacilitator(facilitator);
  const x402Version = 1;

  // Pre-compile route patterns to regex and extract verbs
  const routePatterns = computeRoutePatterns(routes);

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const method = request.method.toUpperCase();

    // Find matching route configuration
    const matchingRoute = findMatchingRoute(routePatterns, pathname, method);

    if (!matchingRoute) {
      return NextResponse.next();
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
      return new NextResponse(atomicAmountForAsset.error, { status: 500 });
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl =
      resource || (`${request.nextUrl.protocol}//${request.nextUrl.host}${pathname}` as Resource);

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

    // Check for payment header
    const paymentHeader = request.headers.get("X-PAYMENT");
    if (!paymentHeader) {
      const accept = request.headers.get("Accept");
      if (accept?.includes("text/html")) {
        const userAgent = request.headers.get("User-Agent");
        if (userAgent?.includes("Mozilla")) {
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

          // TODO: handle paywall html for solana
          const html =
            customPaywallHtml ??
            getPaywallHtml({
              amount: displayAmount,
              paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
                typeof getPaywallHtml
              >[0]["paymentRequirements"],
              currentUrl: request.url,
              testnet: network === "base-sepolia",
              cdpClientKey: paywall?.cdpClientKey,
              appLogo: paywall?.appLogo,
              appName: paywall?.appName,
              sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
            });
          return new NextResponse(html, {
            status: 402,
            headers: { "Content-Type": "text/html" },
          });
        }
      }

      return new NextResponse(
        JSON.stringify({
          x402Version,
          error: errorMessages?.paymentRequired || "X-PAYMENT header is required",
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    // Verify payment
    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(paymentHeader);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
      return new NextResponse(
        JSON.stringify({
          x402Version,
          error:
            errorMessages?.invalidPayment || (error instanceof Error ? error : "Invalid payment"),
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    const selectedPaymentRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment,
    );
    if (!selectedPaymentRequirements) {
      return new NextResponse(
        JSON.stringify({
          x402Version,
          error:
            errorMessages?.noMatchingRequirements || "Unable to find matching payment requirements",
          accepts: toJsonSafe(paymentRequirements),
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    const verification = await verify(decodedPayment, selectedPaymentRequirements);

    if (!verification.isValid) {
      return new NextResponse(
        JSON.stringify({
          x402Version,
          error: errorMessages?.verificationFailed || verification.invalidReason,
          accepts: paymentRequirements,
          payer: verification.payer,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    // Proceed with request
    const response = await NextResponse.next();

    // if the response from the protected route is >= 400, do not settle the payment
    if (response.status >= 400) {
      return response;
    }

    // Settle payment after response
    try {
      const settlement = await settle(decodedPayment, selectedPaymentRequirements);

      if (settlement.success) {
        response.headers.set(
          "X-PAYMENT-RESPONSE",
          safeBase64Encode(
            JSON.stringify({
              success: true,
              transaction: settlement.transaction,
              network: settlement.network,
              payer: settlement.payer,
            }),
          ),
        );
      }
    } catch (error) {
      return new NextResponse(
        JSON.stringify({
          x402Version,
          error:
            errorMessages?.settlementFailed ||
            (error instanceof Error ? error : "Settlement failed"),
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    return response;
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

// Export session token API handlers for Onramp
export { POST };
