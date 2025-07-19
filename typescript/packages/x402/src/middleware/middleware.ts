import {
  FacilitatorConfig,
  moneySchema,
  Network,
  PaymentOption,
  PaymentPayload,
  PaymentRequirements,
  PaywallConfig,
  Resource,
  RouteConfig,
  RoutePattern,
  RoutesConfig,
} from "../types";
import { useFacilitator } from "../verify";
import {
  computeRoutePatterns,
  findMatchingPaymentRequirements,
  findMatchingRoute,
  processPriceToAtomicAmount,
  toJsonSafe,
  getPaywallHtml,
} from "../shared";
import { getAddress } from "viem";
import { exact } from "../schemes";

export type { PaymentMiddlewareConfig, Settlement, HeaderName };
export {
  PaymentMiddlewareConfigError,
  X402Error,
  VerifiedPayment,
  PaymentMiddleware,
  MiddlewareRoutesMap,
  renderPaywallHtml,
};

const X402_VERSION = 1;

type HeaderName = "user-agent" | "x-payment" | "accept";
type NonEmptyArray<T> = [T, ...Array<T>];

/**
 * Converts a `RouteConfig` object into a non-empty array of `PaymentOption`s.
 * Supports both the legacy `price + network` format and the modern `prices[]` format.
 *
 * @param routeConfig - The configuration for a single route.
 * @returns A non-empty array of payment options.
 * @throws {PaymentMiddlewareConfigError} If no price configuration is provided.
 */
export function routeConfigToPaymentOptions(
  routeConfig: RouteConfig,
): NonEmptyArray<PaymentOption> {
  const { price, network, prices } = routeConfig;

  // If a prices array is provided, use it
  if (prices && prices.length > 0) {
    return prices as NonEmptyArray<PaymentOption>;
  }

  // Backward compatibility: use price and network if provided
  if (price && network) {
    return [{ price, network }];
  }

  throw new PaymentMiddlewareConfigError("No price provided");
}

/**
 * Configuration options for the PaymentMiddleware instance.
 *
 * @template TRequest - Framework-specific request type (e.g., Express `Request`, Hono `Context`, etc.).
 */
type PaymentMiddlewareConfig<TRequest> = {
  /** The address to receive payments. */
  payTo: string;
  /** Optional facilitator configuration. */
  facilitator?: FacilitatorConfig;
  /** Optional metadata for rendering a paywall. */
  paywall?: PaywallConfig;
  /**
   * Function to retrieve the value of a given HTTP header from the request.
   * Called for headers like `x-payment`, `accept`, and `user-agent`.
   */
  getHeader: (request: TRequest, name: HeaderName) => string | Array<string> | undefined | null;
  /**
   * Optional override for the price conversion logic, primarily used in tests.
   *
   * @internal
   */
  processPriceToAtomicAmountFn?: typeof processPriceToAtomicAmount;
  /**
   * Optional override for facilitator usage logic, primarily used in tests.
   *
   * @internal
   */
  useFacilitatorFn?: typeof useFacilitator;
};

/**
 * Error thrown during middleware configuration or setup validation.
 */
class PaymentMiddlewareConfigError extends Error {
  readonly name = "PaymentMiddlewareConfigError";
  readonly message: string;
  /**
   * Constructor.
   *
   * @param message - Description of the configuration issue.
   */
  constructor(message: string) {
    super(message);
    this.message = message;
  }
}

/**
 * Error thrown during the x402 payment flow.
 * Can be serialized and returned to clients in a 402 response.
 */
class X402Error extends Error {
  readonly name = "X402Error";
  readonly x402Version = X402_VERSION;
  readonly error: Error | string;
  readonly accepts: Array<PaymentRequirements>;
  readonly payer?: string;

  /**
   * Constructor.
   *
   * @param error - An Error instance or a string describing the issue.
   * @param accepts - List of acceptable payment requirements.
   * @param payer - Optional address of the payer, if known.
   */
  constructor(error: Error | string, accepts: Array<PaymentRequirements>, payer?: string) {
    super(String(error));
    this.error = error;
    this.accepts = accepts;
    this.payer = payer;
  }

  /**
   * Converts the error into a JSON-serializable object for HTTP responses.
   *
   * @returns An object representing the error in x402 JSON format.
   */
  toJSON() {
    return {
      x402Version: this.x402Version,
      error:
        typeof this.error === "object" && "message" in this.error
          ? this.error.message
          : String(this.error),
      accepts: toJsonSafe(this.accepts),
      payer: this.payer,
    };
  }
}

/**
 * The result of a successful x402 settlement.
 *
 * Note: Ideally, this should be part of useFacilitator typing.
 */
type Settlement = {
  /** Indicates settlement was successful. */
  success: true;
  /** Transaction hash of the on-chain transfer. */
  transaction: string;
  /** The network where the payment was settled. */
  network: Network;
  /** Address of the payer. */
  payer: string;
};

type SettleFn = ReturnType<typeof useFacilitator>["settle"];
type VerifyFn = ReturnType<typeof useFacilitator>["verify"];

/**
 * Represents a verified payment that can be settled after serving a response.
 */
class VerifiedPayment {
  readonly payload: PaymentPayload;
  readonly selected: PaymentRequirements;
  readonly requirements: Array<PaymentRequirements>;
  readonly #settle: SettleFn;

  /**
   * Creates a wrapper for a verified payment, allowing it to be settled later.
   *
   * @param payload - The decoded x402 payment payload.
   * @param selected - The matching payment requirements for the payload.
   * @param requirements - Full list of acceptable payment requirements.
   * @param settle - Settlement function returned from the facilitator.
   */
  constructor(
    payload: PaymentPayload,
    selected: PaymentRequirements,
    requirements: Array<PaymentRequirements>,
    settle: SettleFn,
  ) {
    this.payload = payload;
    this.selected = selected;
    this.requirements = requirements;
    this.#settle = settle;
  }

  /**
   * Attempts to settle the payment on-chain.
   *
   * @throws {X402Error} If settlement fails.
   * @returns A promise resolving to a settlement object.
   */
  async settle(): Promise<Settlement> {
    let settlement;
    try {
      settlement = await this.#settle(this.payload, this.selected);
    } catch (e) {
      throw new X402Error(e as Error, this.requirements);
    }
    if (settlement.success) {
      return {
        success: true,
        transaction: settlement.transaction,
        network: settlement.network,
        payer: settlement.payer!,
      };
    } else {
      throw new X402Error(
        `Settlement failed: ${settlement.errorReason}`,
        this.requirements,
        settlement.payer,
      );
    }
  }
}

/**
 * A specialized `Map` that associates route patterns with `PaymentMiddleware` instances,
 * and provides convenient route matching logic.
 *
 * This is the internal structure returned by `PaymentMiddleware.forRoutes()` and is used
 * by framework adapters to dynamically resolve middleware based on request path and method.
 *
 * @template TRequest - The request type used by the `PaymentMiddleware` (e.g., Express `Request`, Hono `Context`, etc).
 *
 * @example
 * const routesMap = PaymentMiddleware.forRoutes(reqHandlerConfig);
 * const middleware = routesMap.match("/weather", "GET");
 * if (middleware) {
 *   const requirements = middleware.paymentRequirements(request);
 *   ...
 * }
 */
class MiddlewareRoutesMap<TRequest> extends Map<RoutePattern, PaymentMiddleware<TRequest>> {
  readonly #routePatterns: RoutePattern[];

  /**
   * Constructs a `MiddlewareRoutesMap` from a list of route pattern and middleware pairs.
   *
   * This class extends `Map` and retains the list of route patterns to enable
   * efficient route matching via the `.match()` method.
   *
   * @param entries - An optional iterable of `[RoutePattern, PaymentMiddleware]` pairs
   *                  used to initialize the map.
   */
  constructor(entries?: readonly (readonly [RoutePattern, PaymentMiddleware<TRequest>])[] | null) {
    super(entries);
    this.#routePatterns = Array.from(this.keys());
  }

  /**
   * Attempts to find a matching middleware based on the request path and method.
   *
   * @param path - The URL path of the incoming request (e.g., `/weather/today`).
   * @param method - The HTTP method of the request (e.g., `GET`, `POST`).
   * @returns The corresponding `PaymentMiddleware` instance, or `undefined` if no match is found.
   */
  match(path: string, method: string): PaymentMiddleware<TRequest> | undefined {
    const route = findMatchingRoute(this.#routePatterns, path, method);
    if (!route) {
      return undefined;
    }
    return this.get(route);
  }
}

/**
 * Core logic for handling x402-based payment validation and settlement.
 *
 * This class is framework-agnostic and should be paired with specific adapters
 * (e.g., Next.js, Express, Hono) for HTTP request/response integration.
 *
 * @template TRequest - The type of the incoming request object.
 */
class PaymentMiddleware<TRequest> {
  readonly config: {
    prices: NonEmptyArray<PaymentOption>;
    config: RouteConfig["config"];
  };
  readonly paywall: PaywallConfig | undefined;

  readonly #verify: VerifyFn;
  readonly #settle: SettleFn;
  readonly #paymentReqs: Array<
    Omit<PaymentRequirements, "resource"> & Pick<Partial<PaymentRequirements>, "resource">
  >;

  readonly #getHeader: (request: TRequest, name: HeaderName) => string | undefined;

  /**
   * Constructs the middleware using the provided configuration.
   *
   * @param config - Configuration including price, payTo, network, and request extractors.
   * @throws {PaymentMiddlewareConfigError} If required config is missing or invalid.
   */
  constructor(config: RouteConfig & PaymentMiddlewareConfig<TRequest>) {
    const useFacilitatorFn = config.useFacilitatorFn || useFacilitator;
    const facilitator = useFacilitatorFn(config.facilitator);
    this.#verify = facilitator.verify.bind(facilitator);
    this.#settle = facilitator.settle.bind(facilitator);
    this.config = {
      prices: routeConfigToPaymentOptions(config),
      config: config.config,
    };
    this.paywall = config.paywall;

    this.#getHeader = (request, name) => {
      const header = config.getHeader(request, name);
      if (!header) {
        return undefined;
      }
      if (Array.isArray(header)) {
        return header.join(",");
      } else {
        return header;
      }
    };

    const processPriceToAtomicAmountFn =
      config.processPriceToAtomicAmountFn || processPriceToAtomicAmount;
    const priceTags = routeConfigToPaymentOptions(config);
    this.#paymentReqs = priceTags.map(priceTag => {
      const atomicAmountForAsset = processPriceToAtomicAmountFn(priceTag.price, priceTag.network);
      if ("error" in atomicAmountForAsset) {
        throw new PaymentMiddlewareConfigError(atomicAmountForAsset.error);
      }
      return {
        scheme: "exact",
        network: priceTag.network,
        maxAmountRequired: atomicAmountForAsset.maxAmountRequired,
        description: config.config?.description ?? "",
        mimeType: config.config?.mimeType ?? "application/json",
        payTo: getAddress(config.payTo),
        maxTimeoutSeconds: config.config?.maxTimeoutSeconds ?? 300,
        asset: getAddress(atomicAmountForAsset.asset.address),
        outputSchema: config.config?.outputSchema,
        extra: atomicAmountForAsset.asset.eip712,
        resource: config.config?.resource,
      };
    });
  }

  /**
   * Constructs a mapping of route patterns to `PaymentMiddleware` instances for a given set of x402-protected routes.
   *
   * This is typically used inside framework-specific adapters (e.g., Express, Hono, Next.js middleware) to build
   * the per-route middleware logic needed to enforce payments.
   *
   * @param props - Includes shared middleware config and per-route payment setup.
   * @returns A map from route patterns to ready-to-use middleware instances.
   */
  static forRoutes<TRequest>(
    props: { routes: RoutesConfig } & PaymentMiddlewareConfig<TRequest>,
  ): MiddlewareRoutesMap<TRequest> {
    const { routes, ...config } = props;
    const routePatterns = computeRoutePatterns(routes);
    return new MiddlewareRoutesMap<TRequest>(
      routePatterns.map(routePattern => {
        return [
          routePattern,
          new PaymentMiddleware<TRequest>({
            ...routePattern.config,
            ...config,
          }),
        ] as const;
      }),
    );
  }

  /**
   * Computes payment requirements for a given resource on this route.
   * The resource will be embedded into each requirement.
   *
   * @param resource - The logical identifier of the resource being accessed (e.g. URL path).
   * @returns An array of `PaymentRequirements` for the request.
   */
  paymentRequirements(resource: Resource): Array<PaymentRequirements> {
    return this.#paymentReqs.map(req => {
      return Object.assign({}, req, {
        resource: req.resource || resource,
      });
    });
  }

  /**
   * Attempts to verify a payment from the request and return a settlement-capable wrapper.
   *
   * @param request - The incoming HTTP request.
   * @param paymentRequirements - Allowed payment options for this resource.
   * @returns A `VerifiedPayment` object on success, or `undefined` if an HTML paywall should be rendered.
   * @throws {X402Error} If the payment is missing, invalid, or does not match any requirements.
   */
  async verifyPayment(
    request: TRequest,
    paymentRequirements: Array<PaymentRequirements>,
  ): Promise<VerifiedPayment | undefined> {
    const paymentHeader = this.#getHeader(request, "x-payment");
    let paymentPayload: PaymentPayload | undefined = undefined;
    if (paymentHeader) {
      try {
        paymentPayload = exact.evm.decodePayment(paymentHeader);
      } catch (error) {
        throw new X402Error(`Invalid payment: ${(error as Error).message}`, paymentRequirements);
      }
    }
    if (!paymentPayload) {
      if (this.canRenderPaywall(request)) {
        return undefined;
      } else {
        throw new X402Error("X-PAYMENT header is required", paymentRequirements);
      }
    }
    const selected = findMatchingPaymentRequirements(paymentRequirements, paymentPayload);
    if (!selected) {
      throw new X402Error("Unable to find matching payment requirements", paymentRequirements);
    }
    const verification = await this.#verify(paymentPayload, selected);
    if (!verification.isValid) {
      throw new X402Error(
        verification.invalidReason ?? "Payment verification failed",
        paymentRequirements,
        verification.payer,
      );
    }
    return new VerifiedPayment(paymentPayload, selected, paymentRequirements, this.#settle);
  }

  /**
   * Checks whether the request appears to come from a browser and accepts HTML.
   * If true, middleware may respond with a paywall HTML page instead of JSON.
   *
   * @param request - The HTTP request to inspect.
   * @returns `true` if paywall rendering is appropriate.
   */
  canRenderPaywall(request: TRequest): boolean {
    const acceptHeader = this.#getHeader(request, "accept");
    const userAgentHeader = this.#getHeader(request, "user-agent");
    return Boolean(acceptHeader?.includes("text/html") && userAgentHeader?.includes("Mozilla"));
  }
}

/**
 * Renders a paywall HTML page based on the provided middleware and requirements.
 * Uses the first `price` tag to determine the displayed amount.
 *
 * @param x402 - The middleware instance providing paywall context.
 * @param paymentRequirements - Acceptable payment options.
 * @param originalUrl - The full URL the user attempted to access.
 * @returns A string containing HTML to be served as the paywall.
 *
 * Note: This is intentionally defined as a standalone function rather than a method on `PaymentMiddleware`
 * to avoid forcing all consumers to include HTML and JS paywall-related code.
 *
 * By keeping it out of the class, bundlers like Webpack, Vite, or esbuild can tree-shake it away
 * if the user does not call `renderPaywallHtml()` — reducing bundle size for non-browser/server use cases.
 */
function renderPaywallHtml(
  x402: PaymentMiddleware<unknown>,
  paymentRequirements: Array<PaymentRequirements>,
  originalUrl: string,
): string {
  const paywall = x402.paywall;
  const customPaywallHtml = x402.config.config?.customPaywallHtml;
  let displayAmount: number;
  // Calculate the display amount for paywall (use the first one as primary)
  const priceTag = x402.config.prices[0];
  const price = priceTag.price;
  const network = priceTag.network;
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

  if (customPaywallHtml) {
    return customPaywallHtml;
  } else {
    return getPaywallHtml({
      amount: displayAmount,
      paymentRequirements: toJsonSafe(paymentRequirements) as Parameters<
        typeof getPaywallHtml
      >[0]["paymentRequirements"],
      currentUrl: originalUrl,
      testnet: network === "base-sepolia",
      cdpClientKey: paywall?.cdpClientKey,
      appName: paywall?.appName,
      appLogo: paywall?.appLogo,
      sessionTokenEndpoint: paywall?.sessionTokenEndpoint,
    });
  }
}
