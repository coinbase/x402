import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getNetworkId, getPaywallHtml, toJsonSafe } from "x402/shared";
import { getUsdcAddressForChain } from "x402/shared/evm";
import { useFacilitator } from "x402/verify";
import { PaymentPayload, Resource } from "x402/types";
import {
  GlobalConfig,
  Money,
  moneySchema,
  PaymentMiddlewareConfig,
  PaymentRequirements,
  settleResponseHeader,
} from "x402/types";
import { exact } from "x402/schemes";

/**
 * Configuration for the Next.js payment middleware
 */
export interface NextPaymentConfig extends GlobalConfig {
  /**
   * Map of route patterns to payment configurations
   * The key is a path pattern that matches Next.js route patterns
   * The value is the payment configuration for that route
   */
  routes: {
    [pattern: string]: {
      amount: Money;
      config?: PaymentMiddlewareConfig;
    };
  };
}

/**
 * Creates a Next.js middleware handler for x402 payments
 *
 * @param globalConfig - Configuration for the payment middleware
 * @returns A Next.js middleware handler
 *
 * @example
 * ```typescript
 * export const middleware = createPaymentMiddleware({
 *   facilitatorUrl: process.env.NEXT_PUBLIC_FACILITATOR_URL,
 *   address: process.env.RESOURCE_WALLET_ADDRESS,
 *   network: process.env.NETWORK,
 *   routes: {
 *     '/protected/*': {
 *       amount: '$0.01',
 *       config: {
 *         description: 'Access to protected content'
 *       }
 *     },
 *     '/api/premium/*': {
 *       amount: '$0.10',
 *       config: {
 *         description: 'Premium API access'
 *       }
 *     }
 *   }
 * });
 * ```
 */
export function createPaymentMiddleware(globalConfig: NextPaymentConfig) {
  const { facilitatorUrl, address, network, routes, createAuthHeaders } = globalConfig;
  const { verify, settle } = useFacilitator(facilitatorUrl, createAuthHeaders);

  // Pre-compile route patterns to regex
  const routePatterns = Object.entries(routes).map(([pattern, config]) => ({
    pattern: new RegExp(
      `^${pattern
        .replace(/\*/g, ".*?") // Make wildcard non-greedy and optional
        .replace(/\[([^\]]+)\]/g, "[^/]+")
        .replace(/\//g, "\\/")}$`,
    ),
    config,
  }));

  return async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Find matching route configuration
    const routeMatch = routePatterns.find(({ pattern }) => pattern.test(pathname));
    if (!routeMatch) {
      return NextResponse.next();
    }

    const { amount, config = {} } = routeMatch.config;
    const { description, mimeType, maxTimeoutSeconds, outputSchema, customPaywallHtml, resource } =
      config;

    const asset = config.asset ?? {
      address: getUsdcAddressForChain(getNetworkId(network)),
      decimals: 6,
      eip712: {
        name: "USDC",
        version: "2",
      },
    };

    const parsedAmount = moneySchema.safeParse(amount);
    if (!parsedAmount.success) {
      return new NextResponse("Invalid payment configuration", { status: 500 });
    }

    const parsedUsdAmount = parsedAmount.data;
    const maxAmountRequired = parsedUsdAmount * 10 ** asset.decimals;

    const resourceUrl =
      resource || (`${request.nextUrl.protocol}//${request.nextUrl.host}${pathname}` as Resource);
    const paymentRequirements: PaymentRequirements[] = [
      {
        scheme: "exact",
        network,
        maxAmountRequired: maxAmountRequired.toString(),
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "",
        payTo: address,
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
        asset: asset.address,
        outputSchema: outputSchema || undefined,
        extra: {
          name: asset.eip712.name,
          version: asset.eip712.version,
        },
      },
    ];

    const payment = request.headers.get("X-PAYMENT");
    const userAgent = request.headers.get("User-Agent") || "";
    const acceptHeader = request.headers.get("Accept") || "";
    const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      if (isWebBrowser) {
        const html =
          customPaywallHtml ||
          getPaywallHtml({
            amount: parsedAmount.data,
            paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
              typeof getPaywallHtml
            >[0]["paymentRequirements"],
            currentUrl: request.url,
            testnet: network === "base-sepolia",
          });

        return new NextResponse(html, {
          status: 402,
          headers: { "Content-Type": "text/html" },
        });
      }

      return NextResponse.json(
        {
          error: "X-PAYMENT header is required",
          paymentRequirements: toJsonSafe(paymentRequirements),
        },
        { status: 402 },
      );
    }

    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(payment);
    } catch (error) {
      return NextResponse.json(
        {
          error: error || "Invalid or malformed payment header",
          paymentRequirements: toJsonSafe(paymentRequirements),
        },
        { status: 402 },
      );
    }

    const selectedPaymentRequirements = paymentRequirements.find(
      value => value.scheme === decodedPayment.scheme && value.network === decodedPayment.network,
    );
    if (!selectedPaymentRequirements) {
      return NextResponse.json(
        {
          error: "Unable to find matching payment requirements",
          paymentRequirements: toJsonSafe(paymentRequirements),
        },
        { status: 402 },
      );
    }

    try {
      const response = await verify(decodedPayment, selectedPaymentRequirements);
      if (!response.isValid) {
        return NextResponse.json(
          {
            error: response.invalidReason,
            paymentRequirements: toJsonSafe(paymentRequirements),
            payerAddress: response.payerAddress,
          },
          { status: 402 },
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          error,
          paymentRequirements: toJsonSafe(paymentRequirements),
        },
        { status: 402 },
      );
    }

    // Let the request proceed
    const response = NextResponse.next();

    try {
      const settleResponse = await settle(decodedPayment, selectedPaymentRequirements);
      const responseHeader = settleResponseHeader(settleResponse);
      response.headers.set("X-PAYMENT-RESPONSE", responseHeader);
    } catch (error) {
      return NextResponse.json(
        {
          error,
          paymentRequirements: toJsonSafe(paymentRequirements),
        },
        { status: 402 },
      );
    }

    return response;
  };
}

export type { Resource, Network, GlobalConfig, PaymentMiddlewareConfig, Money } from "x402/types";
