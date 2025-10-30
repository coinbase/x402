import { Address as SolanaAddress } from "@solana/kit";
import type { Context } from "hono";
import { Address, getAddress } from "viem";
import { getPaywallHtml } from "x402/paywall";
import { exact } from "x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  toJsonSafe,
} from "x402/shared";
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
  settleResponseHeader,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import { isUsdcAddress } from "x402/shared/evm";

/**
 * Creates a payment middleware factory for Hono
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
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
) {
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
      signatureType,
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
        extra: {
          ...(asset as ERC20TokenAmount["asset"]).eip712,
          // Include signatureType if specified (defaults to "authorization" on client for backward compatibility)
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
    const preferredToken = c.req.header("X-PREFERRED-TOKEN");
    const preferredNetwork = c.req.header("X-PREFERRED-NETWORK");

    // Add source token and network information to payment requirements
    if (preferredToken || preferredNetwork) {
      paymentRequirements[0].srcTokenAddress = preferredToken;
      paymentRequirements[0].srcNetwork = preferredNetwork as Network;

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
            cdpClientKey: paywall?.cdpClientKey,
            appName: paywall?.appName,
            appLogo: paywall?.appLogo,
            sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
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

    // Add source token and network information from preference headers for cross-chain payments
    // These should be set if the client originally requested to pay with a different token/network
    const preferredTokenForVerify = c.req.header("X-PREFERRED-TOKEN");
    const preferredNetworkForVerify = c.req.header("X-PREFERRED-NETWORK");

    if (preferredTokenForVerify || preferredNetworkForVerify) {
      selectedPaymentRequirements.srcTokenAddress = preferredTokenForVerify;
      selectedPaymentRequirements.srcNetwork = preferredNetworkForVerify as Network;
    }

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

export type { Address as SolanaAddress } from "@solana/kit";
export type {
  Money,
  Network,
  PaymentMiddlewareConfig,
  Resource,
  RouteConfig,
  RoutesConfig,
} from "x402/types";
