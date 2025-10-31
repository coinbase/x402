import { Address as SolanaAddress } from "@solana/kit";
import { NextFunction, Request, Response } from "express";
import { Address, getAddress } from "viem";
import { getPaywallHtml } from "@b3dotfun/anyspend-x402/paywall";
import { exact } from "@b3dotfun/anyspend-x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  toJsonSafe,
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
  settleResponseHeader,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "@b3dotfun/anyspend-x402/types";
import { useFacilitator } from "@b3dotfun/anyspend-x402/verify";

/**
 * Creates a payment middleware factory for Express
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param paywall - Optional configuration for the default paywall
 * @returns An Express middleware handler
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
 * app.use(paymentMiddleware('0x123...', // payTo: The address to receive payments*    {
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

  return async function paymentMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const matchingRoute = findMatchingRoute(routePatterns, req.path, req.method.toUpperCase());

    if (!matchingRoute) {
      return next();
    }
    console.log("matchingRoute", matchingRoute);

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

    console.log("config", config);

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl: Resource =
      resource || (`${req.protocol}://${req.headers.host}${req.path}` as Resource);

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
        maxTimeoutSeconds: maxTimeoutSeconds ?? 120,
        asset: getAddress(asset.address),
        // TODO: Rename outputSchema to requestStructure
        outputSchema: {
          input: {
            type: "http",
            method: req.method.toUpperCase(),
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
        maxTimeoutSeconds: maxTimeoutSeconds ?? 120,
        asset: asset.address,
        // TODO: Rename outputSchema to requestStructure
        outputSchema: {
          input: {
            type: "http",
            method: req.method.toUpperCase(),
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
    const preferredToken = req.header("X-PREFERRED-TOKEN");
    const preferredNetwork = req.header("X-PREFERRED-NETWORK");
    const paymentHeader = req.header("X-PAYMENT");

    // Add source token and network information to payment requirements, only if no payment header is present
    if ((preferredToken || preferredNetwork) && !paymentHeader) {
      paymentRequirements[0].srcTokenAddress = preferredToken;
      paymentRequirements[0].srcNetwork = preferredNetwork as Network;
      console.log("preferredToken", preferredToken);
      console.log("preferredNetwork", preferredNetwork);
      console.log("asset.address", asset.address);
      console.log("maxAmountRequired", maxAmountRequired);
      console.log("network", network);

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
        console.log("quoteResponse", quoteResponse);
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
        console.log("quote", quote);
        paymentRequirements[0].asset = asset.address;
        paymentRequirements[0].maxAmountRequired = maxAmountRequired.toString();
        paymentRequirements[0].srcAmountRequired = quote.data.paymentAmount.toString();

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

      console.log("paymentRequirements", paymentRequirements);
    }

    const payment = req.header("X-PAYMENT");
    const userAgent = req.header("User-Agent") || "";
    const acceptHeader = req.header("Accept") || "";
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
            currentUrl: req.originalUrl,
            testnet: network === "base-sepolia",
            cdpClientKey: paywall?.cdpClientKey,
            appName: paywall?.appName,
            appLogo: paywall?.appLogo,
            sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
          });
        res.status(402).send(html);
        return;
      }
      res.status(402).json({
        x402Version,
        error: "X-PAYMENT header is required",
        accepts: toJsonSafe(paymentRequirements),
      });
      return;
    }

    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(payment);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
      console.error(error);
      res.status(402).json({
        x402Version,
        error: error || "Invalid or malformed payment header",
        accepts: toJsonSafe(paymentRequirements),
      });
      return;
    }

    const selectedPaymentRequirements = findMatchingPaymentRequirements(
      paymentRequirements,
      decodedPayment,
    );
    if (!selectedPaymentRequirements) {
      res.status(402).json({
        x402Version,
        error: "Unable to find matching payment requirements",
        accepts: toJsonSafe(paymentRequirements),
      });
      return;
    }

    // Add source token and network information from preference headers for cross-chain payments
    // These should be set if the client originally requested to pay with a different token/network
    const preferredTokenForVerify = req.header("X-PREFERRED-TOKEN");
    const preferredNetworkForVerify = req.header("X-PREFERRED-NETWORK");

    if (preferredTokenForVerify || preferredNetworkForVerify) {
      selectedPaymentRequirements.srcTokenAddress = preferredTokenForVerify;
      selectedPaymentRequirements.srcNetwork = preferredNetworkForVerify as Network;
    }

    console.log("Calling verify...");
    console.log("decodedPayment", decodedPayment);
    console.log("selectedPaymentRequirements", selectedPaymentRequirements);

    try {
      const response = await verify(decodedPayment, selectedPaymentRequirements);
      console.log("Verify response:", response);
      if (!response.isValid) {
        res.status(402).json({
          x402Version,
          error: response.invalidReason,
          accepts: toJsonSafe(paymentRequirements),
          payer: response.payer,
        });
        return;
      }
    } catch (error) {
      console.error(error);
      res.status(402).json({
        x402Version,
        error,
        accepts: toJsonSafe(paymentRequirements),
      });
      return;
    }

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
      const settleResponse = await settle(decodedPayment, selectedPaymentRequirements);
      const responseHeader = settleResponseHeader(settleResponse);
      res.setHeader("X-PAYMENT-RESPONSE", responseHeader);

      // if the settle fails, return an error
      if (!settleResponse.success) {
        res.status(402).json({
          x402Version,
          error: settleResponse.errorReason,
          accepts: toJsonSafe(paymentRequirements),
        });
        return;
      }
    } catch (error) {
      console.error(error);
      // If settlement fails and the response hasn't been sent yet, return an error
      if (!res.headersSent) {
        res.status(402).json({
          x402Version,
          error,
          accepts: toJsonSafe(paymentRequirements),
        });
        return;
      }
    } finally {
      res.end = originalEnd;
      if (endArgs) {
        originalEnd(...(endArgs as Parameters<typeof res.end>));
      }
    }
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
