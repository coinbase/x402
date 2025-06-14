import type { Context } from "hono";
import { Address } from "viem";
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
  moneySchema,
  PaymentPayload,
  PaymentRequirements,
  Price,
  Resource,
  RoutesConfig,
} from "x402/types";
import { useFacilitator } from "x402/verify";
import {
  getDepositAddress,
  getDepositedBalance,
  waitForDepositedBalance,
  waitForDepositsConfirmation,
} from "./intents";
import { BASE_USDC_ASSET_ID } from "./constants";

/**
 * Enables intents to be paid for using the x402 payment protocol.
 *
 * This middleware:
 * 1. Validates payment headers and requirements
 * 2. Serves a paywall page for browser requests
 * 3. Returns JSON payment requirements for API requests
 * 4. Verifies and settles payments
 * 5. Sets appropriate response headers
 *
 * @param facilitator - Configuration for the payment facilitator service
 *
 * @returns A function that creates a Hono middleware handler for a specific payment amount
 *
 * @example
 * ```typescript
 * const middleware = intentsPaymentMiddleware(
 *   {
 *     url: 'https://facilitator.example.com',
 *     createAuthHeaders: async () => ({
 *       verify: { "Authorization": "Bearer token" },
 *       settle: { "Authorization": "Bearer token" }
 *     })
 *   }
 * );
 *
 * app.use('/rpc', middleware);
 * ```
 */
export function intentsPaymentMiddleware(facilitator?: FacilitatorConfig) {
  const { verify, settle } = useFacilitator(facilitator);
  const x402Version = 1;

  return async function paymentMiddleware(c: Context, next: () => Promise<void>) {
    const body = await c.req.json();
    const method = body.method;

    // Payment is only required for publishing intents
    // TODO: publish_intents should be supported in the future
    if (method !== "publish_intent") {
      await next();
      return;
    }

    const params = body.params;

    const payload = params[0]?.signed_data?.payload;
    const parsedPayload = JSON.parse(payload);
    const signerId = parsedPayload.signer_id;
    const intents = parsedPayload.intents;

    // Calculate the required BASE USDC balance for the intents
    const requiredBalance: bigint =
      0n -
      intents
        .filter((intent: any) => intent.intent === "token_diff")
        .reduce((acc: bigint, intent: any) => {
          return acc + BigInt(intent.diff[BASE_USDC_ASSET_ID] ?? 0);
        }, 0n);

    // Get the deposit address and the deposited balance
    const [depositAddress, depositedBalance] = await Promise.all([
      getDepositAddress(signerId),
      getDepositedBalance(signerId),
    ]);

    const price = Number(requiredBalance - depositedBalance) / 10 ** 6;
    if (price <= 0) {
      await next();
      return;
    }

    console.log("Payment requirements:", {
      signerId,
      depositAddress,
      requiredBalance,
      availableBalance: depositedBalance,
      requiredPayment: requiredBalance - depositedBalance,
    });

    // Only Base mainnet is supported for now
    const network = "base";
    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }

    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl: Resource = c.req.url as Resource;

    const paymentRequirements: PaymentRequirements[] = [
      {
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: "",
        mimeType: "application/json",
        payTo: depositAddress.address,
        maxTimeoutSeconds: 300,
        asset: asset?.address ?? "",
        outputSchema: {},
        extra: asset?.eip712,
      },
    ];

    const payment = c.req.header("X-PAYMENT");
    const userAgent = c.req.header("User-Agent") || "";
    const acceptHeader = c.req.header("Accept") || "";
    const isWebBrowser = acceptHeader.includes("text/html") && userAgent.includes("Mozilla");

    if (!payment) {
      if (isWebBrowser) {
        let displayAmount: number;
        const parsed = moneySchema.safeParse(price);
        if (parsed.success) {
          displayAmount = parsed.data;
        } else {
          displayAmount = Number.NaN;
        }

        const html = getPaywallHtml({
          amount: displayAmount,
          paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
            typeof getPaywallHtml
          >[0]["paymentRequirements"],
          currentUrl: c.req.path,
          testnet: false,
        });
        return c.html(html, 402);
      }
      return c.json(
        {
          error: "X-PAYMENT header is required",
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
          error: error instanceof Error ? error : new Error("Invalid or malformed payment header"),
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
          error: "Unable to find matching payment requirements",
          accepts: toJsonSafe(paymentRequirements),
          x402Version,
        },
        402,
      );
    }

    const verification = await verify(decodedPayment, selectedPaymentRequirements);

    if (!verification.isValid) {
      return c.json(
        {
          error: new Error(verification.invalidReason),
          accepts: paymentRequirements,
          payer: verification.payer,
          x402Version,
        },
        402,
      );
    }

    // Settle payment after response
    try {
      const settlement = await settle(decodedPayment, paymentRequirements[0]);

      if (settlement.success) {
        c.header(
          "X-PAYMENT-RESPONSE",
          JSON.stringify({
            success: true,
            transaction: settlement.transaction,
            network: settlement.network,
          }),
        );

        await waitForDepositsConfirmation(signerId);
        await waitForDepositedBalance(signerId, requiredBalance);
      }
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error : new Error("Failed to settle payment"),
          accepts: paymentRequirements,
          x402Version,
        },
        402,
      );
    }

    console.log("Payment settled. Proceeding...");
    // Proceed with request
    await next();
  };
}
