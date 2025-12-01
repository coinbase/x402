import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Address } from "viem";
import type { Address as SolanaAddress } from "@solana/kit";
import { exact } from "x402/schemes";
import {
  findMatchingPaymentRequirements,
  toJsonSafe,
  buildPaymentRequirements as buildPaymentRequirementsShared,
} from "x402/shared";
import { getPaywallHtml } from "x402/paywall";
import {
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  Resource,
  PaywallConfig,
  Network,
  Price,
  PaymentMiddlewareConfig,
  SupportedPaymentKindsResponse,
  VerifyResponse,
  SettleResponse,
} from "x402/types";
import { safeBase64Encode } from "x402/shared";

/**
 * Builds payment requirements from route configuration
 *
 * @param payTo - The address to receive payment
 * @param price - The price for the resource
 * @param network - The blockchain network to use
 * @param config - The payment middleware configuration
 * @param resourceUrl - The URL of the resource being protected
 * @param method - The HTTP method for the resource
 * @param supported - Function that returns supported payment kinds
 * @returns Promise resolving to an array of payment requirements
 */
export async function buildPaymentRequirements(
  payTo: Address | SolanaAddress,
  price: Price,
  network: Network,
  config: PaymentMiddlewareConfig,
  resourceUrl: Resource,
  method: string,
  supported: () => Promise<SupportedPaymentKindsResponse>,
): Promise<PaymentRequirements[]> {
  const { description, mimeType, maxTimeoutSeconds, inputSchema, outputSchema, discoverable } =
    config;

  return await buildPaymentRequirementsShared({
    price,
    network,
    method,
    resourceUrl,
    payTo: payTo as unknown as string,
    description,
    mimeType,
    maxTimeoutSeconds,
    inputSchema,
    outputSchema,
    discoverable,
    getSupportedKinds: supported,
  });
}

/**
 * Handles missing payment header by returning 402 response
 *
 * @param request - The Next.js request object
 * @param price - The price for the resource
 * @param network - The blockchain network to use
 * @param paymentRequirements - Array of payment requirements
 * @param x402Version - The X402 protocol version
 * @param errorMessages - Custom error messages configuration
 * @param customPaywallHtml - Custom HTML for the paywall
 * @param paywall - Paywall configuration options
 * @returns NextResponse with 402 status and payment requirements
 */
export function handleMissingPaymentHeader(
  request: NextRequest,
  price: Price,
  network: Network,
  paymentRequirements: PaymentRequirements[],
  x402Version: number,
  errorMessages?: PaymentMiddlewareConfig["errorMessages"],
  customPaywallHtml?: string,
  paywall?: PaywallConfig,
): NextResponse {
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

/**
 * Verifies payment and returns decoded payment or error response
 *
 * @param paymentHeader - The X-PAYMENT header value
 * @param paymentRequirements - Array of payment requirements
 * @param x402Version - The X402 protocol version
 * @param verify - Function to verify the payment
 * @param errorMessages - Custom error messages configuration
 * @returns Promise resolving to decoded payment and requirements, or an error response
 */
export async function verifyPayment(
  paymentHeader: string,
  paymentRequirements: PaymentRequirements[],
  x402Version: number,
  verify: (payment: PaymentPayload, requirements: PaymentRequirements) => Promise<VerifyResponse>,
  errorMessages?: PaymentMiddlewareConfig["errorMessages"],
): Promise<
  | { decodedPayment: PaymentPayload; selectedRequirements: PaymentRequirements }
  | { error: NextResponse }
> {
  // Decode payment
  let decodedPayment: PaymentPayload;
  try {
    decodedPayment = exact.evm.decodePayment(paymentHeader);
    decodedPayment.x402Version = x402Version;
  } catch (error) {
    return {
      error: new NextResponse(
        JSON.stringify({
          x402Version,
          error:
            errorMessages?.invalidPayment ||
            (error instanceof Error ? error.message : "Invalid payment"),
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  const selectedPaymentRequirements = findMatchingPaymentRequirements(
    paymentRequirements,
    decodedPayment,
  );
  if (!selectedPaymentRequirements) {
    return {
      error: new NextResponse(
        JSON.stringify({
          x402Version,
          error:
            errorMessages?.noMatchingRequirements || "Unable to find matching payment requirements",
          accepts: toJsonSafe(paymentRequirements),
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  let verification;
  try {
    verification = await verify(decodedPayment, selectedPaymentRequirements);
  } catch (error) {
    // TODO(v2): Preserve original HTTP status code from facilitator for semantic correctness
    // - 400 for validation errors (invalid network, malformed request)
    // - 402 for payment errors (insufficient funds, invalid signature)
    // - 500 for server errors
    // This is a minor breaking change, so defer to v2
    return {
      error: new NextResponse(
        JSON.stringify({
          x402Version,
          error: error instanceof Error ? error.message : "Payment verification failed",
          accepts: paymentRequirements,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  if (!verification.isValid) {
    return {
      error: new NextResponse(
        JSON.stringify({
          x402Version,
          error: errorMessages?.verificationFailed || verification.invalidReason,
          accepts: paymentRequirements,
          payer: verification.payer,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      ),
    };
  }

  return {
    decodedPayment,
    selectedRequirements: selectedPaymentRequirements,
  };
}

/**
 * Settles payment and adds response header
 *
 * @param response - The Next.js response object
 * @param decodedPayment - The decoded payment payload
 * @param selectedPaymentRequirements - The selected payment requirements
 * @param settle - Function to settle the payment
 * @param x402Version - The X402 protocol version
 * @param errorMessages - Custom error messages configuration
 * @param paymentRequirements - Array of payment requirements for error responses
 * @returns Promise resolving to the response with settlement header or error response
 */
export async function settlePayment(
  response: NextResponse,
  decodedPayment: PaymentPayload,
  selectedPaymentRequirements: PaymentRequirements,
  settle: (payment: PaymentPayload, requirements: PaymentRequirements) => Promise<SettleResponse>,
  x402Version: number,
  errorMessages?: PaymentMiddlewareConfig["errorMessages"],
  paymentRequirements?: PaymentRequirements[],
): Promise<NextResponse> {
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
      return response;
    } else {
      throw new Error(settlement.errorReason);
    }
  } catch (error) {
    return new NextResponse(
      JSON.stringify({
        x402Version,
        error:
          errorMessages?.settlementFailed ||
          (error instanceof Error ? error.message : "Failed to settle payment"),
        accepts: paymentRequirements,
      }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }
}
