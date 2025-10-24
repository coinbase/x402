import type { MiddlewareObj } from "@middy/core";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Address, getAddress } from "viem";
import { Address as SolanaAddress } from "@solana/kit";
import { exact } from "x402/schemes";
import {
  findMatchingPaymentRequirements,
  getPaywallHtml,
  processPriceToAtomicAmount,
  toJsonSafe,
} from "x402/shared";
import {
  FacilitatorConfig,
  ERC20TokenAmount,
  moneySchema,
  Network,
  PaymentPayload,
  PaymentRequirements,
  PaywallConfig,
  Resource,
  settleResponseHeader,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "x402/types";
import { useFacilitator } from "x402/verify";

export interface X402Config {
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  inputSchema?: unknown;
  outputSchema?: unknown;
  customPaywallHtml?: string;
  resource?: Resource;
  discoverable?: boolean;
}

export interface X402MiddlewareOptions {
  payTo: Address | SolanaAddress;
  price: string | number | ERC20TokenAmount;
  network: Network;
  config?: X402Config;
  facilitator?: FacilitatorConfig;
  paywall?: PaywallConfig;
}

/**
 * Creates a payment middleware for AWS Lambda using middy
 *
 * @param options - Configuration options for x402 payment middleware
 * @returns A middy middleware object
 *
 * @example
 * ```typescript
 * import middy from '@middy/core';
 * import { x402Middleware } from 'x402-middy';
 *
 * const baseHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
 *   return {
 *     statusCode: 200,
 *     body: JSON.stringify({ message: 'Protected resource' })
 *   };
 * };
 *
 * export const handler = middy(baseHandler)
 *   .use(x402Middleware({
 *     payTo: '0x123...',
 *     price: '$0.01',
 *     network: 'base-sepolia'
 *   }));
 * ```
 */
export const x402Middleware = (
  options: X402MiddlewareOptions
): MiddlewareObj<APIGatewayProxyEvent, APIGatewayProxyResult> => {
  const { payTo, price, network, config = {}, facilitator, paywall } = options;
  const { verify, settle, supported } = useFacilitator(facilitator);
  const x402Version = 1;

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

  return {
    before: async (request) => {
      const event = request.event;
      const path = event.path || "/";
      const method = event.httpMethod?.toUpperCase() || "GET";

      const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
      if ("error" in atomicAmountForAsset) {
        request.response = {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version,
            error: atomicAmountForAsset.error,
          }),
        };
        return;
      }

      const { maxAmountRequired, asset } = atomicAmountForAsset;
      const resourceUrl: Resource =
        resource ||
        (`${event.headers?.["X-Forwarded-Proto"] || "https"}://${event.headers?.Host || event.headers?.host}${path}` as Resource);

      let paymentRequirements: PaymentRequirements[] = [];

      // EVM networks
      if (SupportedEVMNetworks.includes(network)) {
        paymentRequirements.push({
          scheme: "exact",
          network,
          maxAmountRequired,
          resource: resourceUrl,
          description: description ?? "",
          mimeType: mimeType ?? "",
          payTo: getAddress(payTo as Address),
          maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
          asset: getAddress(asset.address),
          outputSchema: {
            input: {
              type: "http",
              method,
              discoverable: discoverable ?? true,
              ...(inputSchema && typeof inputSchema === "object"
                ? inputSchema
                : {}),
            },
            output: outputSchema,
          },
          extra: (asset as ERC20TokenAmount["asset"]).eip712,
        });
      }
      // SVM networks
      else if (SupportedSVMNetworks.includes(network)) {
        // Get the supported payments from the facilitator
        const paymentKinds = await supported();

        // Find the payment kind that matches the network and scheme
        let feePayer: string | undefined;
        for (const kind of paymentKinds.kinds) {
          if (kind.network === network && kind.scheme === "exact") {
            feePayer = kind?.extra?.feePayer;
            break;
          }
        }

        // If no fee payer is found, throw an error
        if (!feePayer) {
          request.response = {
            statusCode: 500,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              x402Version,
              error: `The facilitator did not provide a fee payer for network: ${network}.`,
            }),
          };
          return;
        }

        paymentRequirements.push({
          scheme: "exact",
          network,
          maxAmountRequired,
          resource: resourceUrl,
          description: description ?? "",
          mimeType: mimeType ?? "",
          payTo: payTo as SolanaAddress,
          maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
          asset: asset.address,
          outputSchema: {
            input: {
              type: "http",
              method,
              discoverable: discoverable ?? true,
              ...(inputSchema && typeof inputSchema === "object"
                ? inputSchema
                : {}),
            },
            output: outputSchema,
          },
          extra: {
            feePayer,
          },
        });
      } else {
        request.response = {
          statusCode: 500,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version,
            error: `Unsupported network: ${network}`,
          }),
        };
        return;
      }

      const payment =
        event.headers?.["X-PAYMENT"] ??
        event.headers?.["X-Payment"] ??
        event.headers?.["x-payment"];
      const userAgent =
        event.headers?.["User-Agent"] ?? event.headers?.["user-agent"] ?? "";
      const acceptHeader =
        event.headers?.["Accept"] ?? event.headers?.["accept"] ?? "";
      const isWebBrowser =
        acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

      if (!payment) {
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
              paymentRequirements: toJsonSafe(
                paymentRequirements
              ) as Parameters<typeof getPaywallHtml>[0]["paymentRequirements"],
              currentUrl: path,
              testnet: network === "base-sepolia",
              cdpClientKey: paywall?.cdpClientKey,
              appName: paywall?.appName,
              appLogo: paywall?.appLogo,
              sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
            });
          request.response = {
            statusCode: 402,
            headers: {
              "Content-Type": "text/html",
            },
            body: html,
          };
          return;
        }
        request.response = {
          statusCode: 402,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version,
            error: "X-PAYMENT header is required",
            accepts: toJsonSafe(paymentRequirements),
          }),
        };
        return;
      }

      let decodedPayment: PaymentPayload;
      try {
        decodedPayment = exact.evm.decodePayment(payment);
        decodedPayment.x402Version = x402Version;
      } catch (error) {
        console.error(error);
        request.response = {
          statusCode: 402,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version,
            error: error || "Invalid or malformed payment header",
            accepts: toJsonSafe(paymentRequirements),
          }),
        };
        return;
      }

      const selectedPaymentRequirements = findMatchingPaymentRequirements(
        paymentRequirements,
        decodedPayment
      );
      if (!selectedPaymentRequirements) {
        request.response = {
          statusCode: 402,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version,
            error: "Unable to find matching payment requirements",
            accepts: toJsonSafe(paymentRequirements),
          }),
        };
        return;
      }

      try {
        const response = await verify(
          decodedPayment,
          selectedPaymentRequirements
        );
        if (!response.isValid) {
          request.response = {
            statusCode: 402,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              x402Version,
              error: response.invalidReason,
              accepts: toJsonSafe(paymentRequirements),
              payer: response.payer,
            }),
          };
          return;
        }
      } catch (error) {
        console.error(error);
        request.response = {
          statusCode: 402,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version,
            error: error instanceof Error ? error.message : error,
            accepts: toJsonSafe(paymentRequirements),
          }),
        };
        return;
      }

      // Store payment data for after hook
      (request.context as any).x402Payment = {
        decodedPayment,
        selectedPaymentRequirements,
      };
    },
    after: async (request) => {
      const x402Data = (request.context as any).x402Payment;
      if (!x402Data) {
        return;
      }

      const { decodedPayment, selectedPaymentRequirements } = x402Data;
      // If response status is >= 400, do not settle payment
      if (request.response && request.response.statusCode >= 400) {
        return;
      }

      try {
        const settleResponse = await settle(
          decodedPayment,
          selectedPaymentRequirements
        );
        const responseHeader = settleResponseHeader(settleResponse);

        if (request.response) {
          request.response.headers = {
            ...request.response.headers,
            "X-PAYMENT-RESPONSE": responseHeader,
          };
        }

        // If settlement fails, return an error
        if (!settleResponse.success) {
          request.response = {
            statusCode: 402,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              x402Version: 1,
              error: settleResponse.errorReason,
              accepts: toJsonSafe([selectedPaymentRequirements]),
            }),
          };
          return;
        }
      } catch (error) {
        console.error(error);
        request.response = {
          statusCode: 402,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            x402Version: 1,
            error: error instanceof Error ? error.message : error,
            accepts: toJsonSafe([selectedPaymentRequirements]),
          }),
        };
        return;
      }
    },
    onError: async (request) => {
      // On error, do not settle payment
      console.error("x402 middleware - error occurred, payment not settled");
    },
  };
};

export type {
  Money,
  Network,
  FacilitatorConfig,
  PaywallConfig,
  Resource,
  PaymentRequirements,
  PaymentPayload,
} from "x402/types";
export type { Address } from "viem";
export type { Address as SolanaAddress } from "@solana/kit";
