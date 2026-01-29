import type { Address as SolanaAddress } from "@solana/kit";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Address, getAddress } from "viem";
import { getPaywallHtml } from "@b3dotfun/anyspend-x402/paywall";
import { exact } from "@b3dotfun/anyspend-x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  safeBase64Encode,
  toJsonSafe,
  validateTokenCompatibility,
} from "@b3dotfun/anyspend-x402/shared";
import { isUsdcAddress } from "@b3dotfun/anyspend-x402/shared/evm";
import {
  ERC20TokenAmount,
  evmSignatureTypes,
  FacilitatorConfig,
  moneySchema,
  Network,
  PaymentPayload,
  PaymentRequirements,
  PaywallConfig,
  Resource,
  RoutesConfig,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "@b3dotfun/anyspend-x402/types";
import { useFacilitator } from "@b3dotfun/anyspend-x402/verify";

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
      signatureType,
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
      const tokenAddress = getAddress(asset.address);

      paymentRequirements.push({
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "application/json",
        payTo: getAddress(payTo),
        maxTimeoutSeconds: maxTimeoutSeconds ?? 300,
        asset: tokenAddress,
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
          ...(asset as ERC20TokenAmount["asset"]).eip712,
          // Include signatureType if specified by facilitator
          ...(signatureType && { signatureType }),
        },
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

    // Read payment preference headers from client
    const preferredToken = request.headers.get("X-PREFERRED-TOKEN");
    const preferredNetwork = request.headers.get("X-PREFERRED-NETWORK");
    const paymentHeader = request.headers.get("X-PAYMENT");

    // Add source token and network information to payment requirements, only if no payment header is present
    if ((preferredToken || preferredNetwork) && !paymentHeader) {
      // Validate token compatibility first (only if preferredToken is provided)
      if (preferredToken && preferredNetwork) {
        const preferredTokenValidation = await validateTokenCompatibility(
          preferredNetwork as Network,
          preferredToken,
        );

        if (!preferredTokenValidation.isCompatible) {
          const errorMessage =
            preferredTokenValidation.reason ||
            "Preferred token does not support gasless transactions";
          console.error(`Token compatibility check failed for preferred token: ${errorMessage}`);

          return new NextResponse(
            JSON.stringify({
              error: "token_not_supported",
              message: errorMessage,
              tokenAddress: preferredToken,
              network: preferredNetwork,
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }
      }

      paymentRequirements[0].srcTokenAddress = preferredToken ?? undefined;
      paymentRequirements[0].srcNetwork = (preferredNetwork as Network) ?? undefined;

      // Check if preferred token is USDC on any chain - skip quote if paying with USDC
      // If no preferredToken is provided, default to USDC
      const isUsdcPayment = !preferredToken || isUsdcAddress(preferredToken);

      // Also check if it matches destination token on same network (for non-USDC cases)
      const isSameTokenAndNetwork =
        preferredToken &&
        preferredToken.toLowerCase() === asset.address.toLowerCase() &&
        preferredNetwork === network;

      if (!isUsdcPayment || !isSameTokenAndNetwork) {
        const quoteResponse = await fetch(`${facilitator?.url}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            srcTokenAddress: preferredToken,
            dstTokenAddress: asset.address,
            dstAmount: maxAmountRequired.toString(),
            srcNetwork: preferredNetwork,
            dstNetwork: network,
          }),
        });
        if (!quoteResponse.ok) {
          throw new Error(`Failed to get quote: ${quoteResponse.statusText}`);
        }
        const quote = (await quoteResponse.json()) as {
          data: {
            paymentAmount: string;
            facilitatorAddress?: string;
            signatureType?: string;
            domain?: {
              name: string;
              version: string;
              chainId: number;
              verifyingContract: string;
            };
          };
        };

        paymentRequirements[0].asset = preferredToken as string;
        paymentRequirements[0].maxAmountRequired = quote.data.paymentAmount;

        // Replace extra field with only quote response data (remove default eip712 domain)
        paymentRequirements[0].extra = {};

        // Add domain from quote response if provided
        if (quote.data.domain) {
          paymentRequirements[0].extra.name = quote.data.domain.name;
          paymentRequirements[0].extra.version = quote.data.domain.version;
          paymentRequirements[0].extra.chainId = quote.data.domain.chainId;
          paymentRequirements[0].extra.verifyingContract = quote.data.domain.verifyingContract;
        }

        // Add facilitatorAddress from quote response to extra field if provided
        if (quote.data.facilitatorAddress) {
          paymentRequirements[0].extra.facilitatorAddress = quote.data.facilitatorAddress;
        }

        if (quote.data.signatureType) {
          paymentRequirements[0].extra.signatureType = quote.data
            .signatureType as (typeof evmSignatureTypes)[number];
        }
      } else {
        if (isUsdcPayment) {
          console.log("✓ Paying with USDC - skipping quote");
        } else {
          console.log("✓ Paying with destination token on same network - skipping quote");
        }
        paymentRequirements[0].srcAmountRequired = maxAmountRequired.toString();
      }

      console.log(
        `Payment preferences received - Token: ${preferredToken}, Network: ${preferredNetwork}`,
      );
    }

    // Check for payment header
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
      const errorMessage =
        errorMessages?.invalidPayment ||
        (error instanceof Error
          ? error.message
          : typeof error === "string" && error
            ? error
            : "Invalid payment");
      return new NextResponse(
        JSON.stringify({
          x402Version,
          error: errorMessage,
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    const selectedPaymentRequirements =
      findMatchingPaymentRequirements(paymentRequirements, decodedPayment) ||
      paymentRequirements[0];
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

    // Add source token and network information from preference headers for cross-chain payments
    // These should be set if the client originally requested to pay with a different token/network
    const preferredTokenForVerify = request.headers.get("X-PREFERRED-TOKEN");
    const preferredNetworkForVerify = request.headers.get("X-PREFERRED-NETWORK");

    if (preferredTokenForVerify || preferredNetworkForVerify) {
      selectedPaymentRequirements.srcTokenAddress = preferredTokenForVerify ?? undefined;
      selectedPaymentRequirements.srcNetwork = (preferredNetworkForVerify as Network) ?? undefined;
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
      const errorMessage =
        errorMessages?.settlementFailed ||
        (error instanceof Error
          ? error.message
          : typeof error === "string" && error
            ? error
            : "Settlement failed");
      return new NextResponse(
        JSON.stringify({
          x402Version,
          error: errorMessage,
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    return response;
  };
}

export type { Address as SolanaAddress } from "@solana/kit";
export type {
  Money,
  Network,
  PaymentMiddlewareConfig,
  Resource,
  RouteConfig,
  RoutesConfig,
} from "@b3dotfun/anyspend-x402/types";

// Export session token API handlers for Onramp
export { POST };
