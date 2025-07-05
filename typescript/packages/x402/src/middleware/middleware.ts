import type {
  FacilitatorConfig,
  Network,
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
} from "../shared";
import { type Address, getAddress } from "viem";

export type { PaymentMiddlewareConfig, Settlement };
export {
  PaymentMiddlewareConfigError,
  X402Error,
  AcquiredPayment,
  PaymentMiddleware,
  MiddlewareRoutesMap,
};

const X402_VERSION = 1;

/**
 * Configuration options for the PaymentMiddleware.
 *
 * @template TRequest - The request type, typically a framework-specific request object.
 */
type PaymentMiddlewareConfig<TRequest> = RouteConfig & {
  /** The address to receive payments. */
  payTo: string;
  /** Optional facilitator configuration. */
  facilitator?: FacilitatorConfig;
  /** Optional metadata for rendering a paywall. */
  paywall?: PaywallConfig;
  /** Function to derive the resource identifier from a request. Either `resource` or this `resourceFromRequest` should be configured. */
  resourceFromRequest?: (request: TRequest) => Resource;
  /** Determines whether a paywall can be rendered for the given request if no payment header is present */
  canRenderPaywall?: (request: TRequest) => boolean;
  /** Extracts and decodes the payment payload from the request. */
  paymentFromRequest: (request: TRequest) => PaymentPayload | undefined;

  /** Pass a custom ` processPriceToAtomicAmount ` function for testing purposes */
  processPriceToAtomicAmountFn?: typeof processPriceToAtomicAmount;
  /** Pass a custom `facilitator.verify` function for testing purposes */
  verifyFn?: ReturnType<typeof useFacilitator>["verify"];
  /** Pass a custom `facilitator.settle` function for testing purposes */
  settleFn?: ReturnType<typeof useFacilitator>["settle"];
};

/**
 * Thrown when the middleware is misconfigured or encounters an invalid setup.
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

/**
 * Represents a verified payment that can be settled after serving a response.
 */
class AcquiredPayment {
  readonly payload: PaymentPayload;
  readonly selected: PaymentRequirements;
  readonly requirements: Array<PaymentRequirements>;
  readonly #settle: ReturnType<typeof useFacilitator>["settle"];

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
    settle: ReturnType<typeof useFacilitator>["settle"],
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
  readonly config: RouteConfig;

  readonly #facilitator: ReturnType<typeof useFacilitator>;
  readonly #paymentReq: Omit<PaymentRequirements, "resource">;

  readonly #resource: Resource | Required<PaymentMiddlewareConfig<TRequest>>["resourceFromRequest"];
  readonly #paymentFromRequest: PaymentMiddlewareConfig<TRequest>["paymentFromRequest"];
  readonly #canRenderPaywall?: (request: TRequest) => boolean;

  /**
   * Constructs the middleware using the provided configuration.
   *
   * @param config - Configuration including price, payTo, network, and request extractors.
   * @throws {PaymentMiddlewareConfigError} If required config is missing or invalid.
   */
  constructor(config: PaymentMiddlewareConfig<TRequest>) {
    let facilitator = useFacilitator(config.facilitator);
    if (config.verifyFn) {
      facilitator.verify = config.verifyFn;
    }
    if (config.settleFn) {
      facilitator.settle = config.settleFn;
    }
    this.#facilitator = facilitator;
    this.#paymentFromRequest = config.paymentFromRequest;
    this.#canRenderPaywall = config.canRenderPaywall;

    this.config = {
      price: config.price,
      network: config.network,
      config: config.config,
    };

    const resource = config.config?.resource || config.resourceFromRequest;
    if (!resource) {
      throw new PaymentMiddlewareConfigError(
        "Either config.resource or resourceFromRequest must be provided",
      );
    }
    this.#resource = resource;
    const processPriceToAtomicAmountFn =
      config.processPriceToAtomicAmountFn || processPriceToAtomicAmount;
    const atomicAmountForAsset = processPriceToAtomicAmountFn(config.price, config.network);
    if ("error" in atomicAmountForAsset) {
      throw new PaymentMiddlewareConfigError(atomicAmountForAsset.error);
    }
    this.#paymentReq = {
      scheme: "exact",
      network: config.network,
      maxAmountRequired: atomicAmountForAsset.maxAmountRequired,
      description: config.config?.description ?? "",
      mimeType: config.config?.mimeType ?? "application/json",
      payTo: getAddress(config.payTo),
      maxTimeoutSeconds: config.config?.maxTimeoutSeconds ?? 300,
      asset: getAddress(atomicAmountForAsset.asset.address),
      outputSchema: config.config?.outputSchema,
      extra: atomicAmountForAsset.asset.eip712,
    };
  }

  /**
   * Constructs a mapping of route patterns to `PaymentMiddleware` instances for a given set of x402-protected routes.
   *
   * This is typically used inside framework-specific adapters (e.g., Express, Hono, Next.js middleware) to build
   * the per-route middleware logic needed to enforce payments.
   *
   * @template TRequest - The request type (e.g., Express `Request`, Hono `Context`, etc).
   * @param payTo - The address to receive payments.
   * @param routes - A mapping of route patterns to their associated payment configurations.
   * @param paymentFromRequest - A function to extract the x402 payment payload from a request.
   * @param canRenderPaywall - A function that determines if an HTML paywall should be rendered for a given request.
   * @param facilitator - Optional facilitator configuration (e.g. custom verify/settle endpoints).
   * @param paywall - Optional metadata for customizing the HTML paywall UI.
   * @param useFacilitatorFn - Internal injection point for `useFacilitator`, primarily used for testing.
   * @returns A `Map` associating route patterns with corresponding `PaymentMiddleware` instances.
   */
  static forRoutes<TRequest>(
    payTo: Address,
    routes: RoutesConfig,
    paymentFromRequest: PaymentMiddlewareConfig<TRequest>["paymentFromRequest"],
    canRenderPaywall: PaymentMiddlewareConfig<TRequest>["canRenderPaywall"],
    facilitator?: FacilitatorConfig,
    paywall?: PaywallConfig,
    useFacilitatorFn: typeof useFacilitator = useFacilitator,
  ): MiddlewareRoutesMap<TRequest> {
    const { verify, settle } = useFacilitatorFn(facilitator);
    const routePatterns = computeRoutePatterns(routes);
    return new MiddlewareRoutesMap<TRequest>(
      routePatterns.map(routePattern => {
        return [
          routePattern,
          new PaymentMiddleware<TRequest>({
            payTo: payTo,
            facilitator: facilitator,
            paywall: paywall,
            price: routePattern.config.price,
            network: routePattern.config.network,
            config: routePattern.config.config,
            verifyFn: verify,
            settleFn: settle,
            paymentFromRequest,
            canRenderPaywall,
          }),
        ] as const;
      }),
    );
  }

  /**
   * Builds the full list of payment requirements for a given request.
   *
   * @param request - The incoming request.
   * @returns An array of acceptable payment requirement objects.
   */
  paymentRequirements(request: TRequest): Array<PaymentRequirements> {
    let resource: Resource;
    if (typeof this.#resource === "function") {
      resource = this.#resource(request);
    } else {
      resource = this.#resource;
    }
    const paymentRequirement = Object.assign({}, this.#paymentReq, {
      resource: resource,
    });
    return [paymentRequirement];
  }

  /**
   * Attempts to acquire and verify a payment for the request.
   *
   * @param request - The incoming HTTP request.
   * @param paymentRequirements - Requirements this route expects.
   * @returns An AcquiredPayment object on success, or undefined if paywall should be shown.
   * @throws {X402Error} If payment is missing or invalid.
   */
  async acquirePayment(
    request: TRequest,
    paymentRequirements: Array<PaymentRequirements>,
  ): Promise<AcquiredPayment | undefined> {
    let paymentPayload: PaymentPayload | undefined;
    try {
      paymentPayload = this.#paymentFromRequest(request);
    } catch (error) {
      throw new X402Error(error as Error, paymentRequirements);
    }
    if (!paymentPayload) {
      if (this.#canRenderPaywall?.(request)) {
        return undefined;
      } else {
        throw new X402Error("X-PAYMENT header is required", paymentRequirements);
      }
    }
    const selected = findMatchingPaymentRequirements(paymentRequirements, paymentPayload);
    if (!selected) {
      throw new X402Error("Unable to find matching payment requirements", paymentRequirements);
    }
    const verification = await this.#facilitator.verify(paymentPayload, selected);
    if (!verification.isValid) {
      throw new X402Error(
        verification.invalidReason ?? "Payment verification failed",
        paymentRequirements,
        verification.payer,
      );
    }
    return new AcquiredPayment(
      paymentPayload,
      selected,
      paymentRequirements,
      this.#facilitator.settle.bind(this.#facilitator),
    );
  }
}
