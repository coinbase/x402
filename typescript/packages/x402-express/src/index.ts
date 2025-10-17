import { NextFunction, Request, Response } from "express";
import { Address, getAddress } from "viem";
import { Address as SolanaAddress } from "@solana/kit";
import { exact, deferred } from "x402/schemes";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  getNetworkId,
  getPaywallHtml,
  processPriceToAtomicAmount,
  toJsonSafe,
} from "x402/shared";
import {
  FacilitatorConfig,
  ERC20TokenAmount,
  moneySchema,
  PaymentPayload,
  PaywallConfig,
  Resource,
  RoutesConfig,
  settleResponseHeader,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  PaymentRequirementsSchema,
  PaymentRequirements,
  DEFERRRED_SCHEME,
  DeferredEvmPayloadSchema,
  EXACT_SCHEME,
  SettleResponse,
} from "x402/types";
import { useFacilitator } from "x402/verify";

/**
 * Creates an exact payment middleware factory for Express
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
      resource || (`${req.protocol}://${req.headers.host}${req.path}` as Resource);

    let paymentRequirements: PaymentRequirements[] = [];

    // TODO: create a shared middleware function to build payment requirements
    // evm networks
    if (SupportedEVMNetworks.includes(network)) {
      paymentRequirements.push({
        scheme: EXACT_SCHEME,
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
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
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

    try {
      const response = await verify(decodedPayment, selectedPaymentRequirements);
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
    next();

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

/**
 * Creates a deferred payment middleware factory for Express.
 *
 * Note: this middleware does not perform the x402 settlement step. In the deferred scheme,
 * settlement does not happen as part of the x402 resource request handshake, it happens later
 * on in a "deferred" way.
 *
 * The middleware delegates voucher storage to the facilitator but can be configured to store vouchers
 * locally on the resource server. The server needs to implement it's own voucher store and expose two
 * main functions for the middleware:
 * - getAvailableVoucher: Retrieves the latest voucher for a given buyer/seller
 * - storeVoucher: Persists newly created vouchers
 *
 * If `voucherStore` is not provided, voucher storage is delegated to the facilitator.
 *
 * @param payTo - The address to receive payments
 * @param routes - Configuration for protected routes and their payment requirements
 * @param escrow - The escrow contract address
 * @param facilitator - Optional configuration for the payment facilitator service
 * @param voucherStore - Optional voucher storage implementation with `getAvailableVoucher` and `storeVoucher` methods
 * @returns An Express middleware handler
 *
 * @example
 * ```typescript
 * // Simple configuration — all endpoints protected by $0.01 of USDC on Base Sepolia
 * // Uses facilitator for voucher storage
 * app.use(
 *   deferredPaymentMiddleware(
 *     '0x123...', // payTo address
 *     {
 *       price: '$0.01', // USDC amount in dollars
 *       network: 'base-sepolia',
 *     },
 *     '0xescrowAddress...',
 *     // Optional facilitator configuration (defaults to x402.org/facilitator for testnet usage)
 *   )
 * );
 *
 * // Advanced configuration — custom voucher store and facilitator
 * app.use(
 *   deferredPaymentMiddleware(
 *     '0x123...', // payTo
 *     {
 *       '/weather/*': {
 *         price: '$0.001', // USDC amount in dollars
 *         network: 'base',
 *         config: {
 *           description: 'Access to weather data',
 *         },
 *       },
 *     },
 *     '0xescrowAddress...',
 *     {
 *       url: 'https://facilitator.example.com',
 *       createAuthHeaders: async () => ({
 *         verify: { Authorization: 'Bearer token' },
 *         settle: { Authorization: 'Bearer token' },
 *       }),
 *     },
 *     {
 *       getAvailableVoucher: async (buyer, seller) => {
 *         // Custom implementation to retrieve voucher
 *         return await db.getVoucher(buyer, seller);
 *       },
 *       storeVoucher: async (voucher) => {
 *         // Custom implementation to store voucher
 *         await db.saveVoucher(voucher);
 *       },
 *     }
 *   )
 * );
 * ```
 */
export function deferredPaymentMiddleware(
  payTo: Address,
  routes: RoutesConfig,
  escrow: Address,
  facilitator: FacilitatorConfig,
  voucherStore?: Pick<
    InstanceType<typeof deferred.evm.VoucherStore>,
    "getAvailableVoucher" | "storeVoucher"
  >,
) {
  const x402Version = 1;
  const { verify, deferred: deferredFacilitator } = useFacilitator(facilitator);

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

    const { price, network, config = {} } = matchingRoute.config;
    const { description, mimeType, maxTimeoutSeconds, outputSchema, resource } = config;

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    const resourceUrl: Resource =
      resource || (`${req.protocol}://${req.headers.host}${req.path}` as Resource);

    const payment = req.header("X-PAYMENT");
    const paymentBuyer = req.header("X-PAYMENT-BUYER");

    const unparsedPaymentRequirements = [
      {
        scheme: DEFERRRED_SCHEME,
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: mimeType ?? "",
        payTo: getAddress(payTo),
        maxTimeoutSeconds: maxTimeoutSeconds ?? 60,
        asset: getAddress(asset.address),
        outputSchema: outputSchema ?? undefined,
        extra: await deferred.evm.getPaymentRequirementsExtra(
          payment,
          paymentBuyer as `0x${string}` | undefined,
          payTo,
          escrow,
          getAddress(asset.address),
          getNetworkId(network),
          facilitator,
          voucherStore?.getAvailableVoucher,
        ),
      },
    ];

    const paymentRequirements = unparsedPaymentRequirements.map(req => {
      const parsed = PaymentRequirementsSchema.safeParse(req);
      if (!parsed.success) {
        throw new Error(`Invalid payment requirements: ${parsed.error.message}`);
      }
      return parsed.data;
    });

    if (!payment) {
      res.status(402).json({
        x402Version,
        error: "X-PAYMENT header is required",
        accepts: toJsonSafe(paymentRequirements),
      });
      return;
    }

    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = deferred.evm.decodePayment(payment);
      decodedPayment.x402Version = x402Version;
    } catch (error) {
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

    // At this point x402 protocol requires POSTing to /verify the payment requirements
    // If we are using the facilitator's voucher store then when posting to store the voucher the facilitator
    // will already perform the same verification. So if we use the facilitator's voucher store we can skip /verify.
    if (voucherStore) {
      try {
        // POST /verify to facilitator
        const response = await verify(decodedPayment, selectedPaymentRequirements);
        if (!response.isValid) {
          res.status(402).json({
            x402Version,
            error: response.invalidReason,
            accepts: toJsonSafe(paymentRequirements),
            payer: response.payer,
          });
          return;
        }

        // Store voucher locally
        const { voucher, signature } = DeferredEvmPayloadSchema.parse(decodedPayment.payload);
        await voucherStore.storeVoucher({ ...voucher, signature });
      } catch (error) {
        console.log(error);
        res.status(402).json({
          x402Version,
          error,
          accepts: toJsonSafe(paymentRequirements),
        });
        return;
      }
    } else {
      try {
        // skip POST /verify and store voucher in facilitator
        await deferredFacilitator.storeVoucher(decodedPayment, selectedPaymentRequirements);
      } catch (error) {
        console.error(error);
        res.status(402).json({
          x402Version,
          error,
          accepts: toJsonSafe(paymentRequirements),
        });
        return;
      }
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
    next();

    // If the response from the protected route is >= 400, do not set X-PAYMENT-RESPONSE
    if (res.statusCode >= 400) {
      res.end = originalEnd;
      if (endArgs) {
        originalEnd(...(endArgs as Parameters<typeof res.end>));
      }
      return;
    }

    // Return with X-PAYMENT-RESPONSE
    const responseHeader = settleResponseHeader({
      success: true,
    } as SettleResponse);
    res.setHeader("X-PAYMENT-RESPONSE", responseHeader);

    res.end = originalEnd;
    if (endArgs) {
      originalEnd(...(endArgs as Parameters<typeof res.end>));
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
