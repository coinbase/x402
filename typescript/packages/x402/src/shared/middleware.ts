import { Address, getAddress, Hex } from "viem";
import {
  DeferredScheme,
  ERC20TokenAmount,
  ExactNetwork,
  ExactScheme,
  isDeferredNetwork,
  moneySchema,
  Network,
  PaymentPayload,
  PaymentRequirements,
  PaymentRequirementsMiddleware,
  Price,
  RouteConfig,
  RoutePattern,
  RoutesConfig,
  SPLTokenAmount,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
} from "../types";
import { safeBase64Decode } from "./base64";
import { getUsdcChainConfigForChain } from "./evm";
import { getNetworkId } from "./network";

/**
 * Computes the route patterns for the given routes config
 *
 * @param routes - The routes config to compute the patterns for
 * @returns The route patterns
 */
export function computeRoutePatterns(routes: RoutesConfig): RoutePattern[] {
  const normalizedRoutes = Object.fromEntries(
    Object.entries(routes).map(([pattern, value]) => [
      pattern,
      typeof value === "string" || typeof value === "number"
        ? ({ price: value, network: "base-sepolia" } as RouteConfig)
        : (value as RouteConfig),
    ]),
  );

  return Object.entries(normalizedRoutes).map(([pattern, routeConfig]) => {
    // Split pattern into verb and path, defaulting to "*" for verb if not specified
    const [verb, path] = pattern.includes(" ") ? pattern.split(/\s+/) : ["*", pattern];
    if (!path) {
      throw new Error(`Invalid route pattern: ${pattern}`);
    }
    return {
      verb: verb.toUpperCase(),
      pattern: new RegExp(
        `^${
          path
            // First escape all special regex characters except * and []
            .replace(/[$()+.?^{|}]/g, "\\$&")
            // Then handle our special pattern characters
            .replace(/\*/g, ".*?") // Make wildcard non-greedy and optional
            .replace(/\[([^\]]+)\]/g, "[^/]+") // Convert [param] to regex capture
            .replace(/\//g, "\\/") // Escape slashes
        }$`,
        "i",
      ),
      config: routeConfig,
    };
  });
}

/**
 * Finds the matching route pattern for the given path and method
 *
 * @param routePatterns - The route patterns to search through
 * @param path - The path to match against
 * @param method - The HTTP method to match against
 * @returns The matching route pattern or undefined if no match is found
 */
export function findMatchingRoute(
  routePatterns: RoutePattern[],
  path: string,
  method: string,
): RoutePattern | undefined {
  // Normalize the path:
  // 1. Remove query parameters and hash fragments
  // 2. Replace backslashes with forward slashes
  // 3. Replace multiple consecutive slashes with a single slash
  // 4. Keep trailing slash if path is not root
  let normalizedPath: string;
  try {
    // First split off query parameters and hash fragments
    const pathWithoutQuery = path.split(/[?#]/)[0];

    // Then decode the path - this needs to happen before any normalization
    // so encoded characters are properly handled
    const decodedPath = decodeURIComponent(pathWithoutQuery);

    // Normalize the path (just clean up slashes)
    normalizedPath = decodedPath
      .replace(/\\/g, "/") // replace backslashes
      .replace(/\/+/g, "/") // collapse slashes
      .replace(/(.+?)\/+$/, "$1"); // trim trailing slashes
  } catch {
    // If decoding fails (e.g., invalid % encoding), return undefined
    return undefined;
  }

  // Find matching route pattern
  const matchingRoutes = routePatterns.filter(({ pattern, verb }) => {
    const matchesPath = pattern.test(normalizedPath);
    const upperMethod = method.toUpperCase();
    const matchesVerb = verb === "*" || upperMethod === verb;

    const result = matchesPath && matchesVerb;
    return result;
  });

  if (matchingRoutes.length === 0) {
    return undefined;
  }

  // Use the most specific route (longest path pattern)
  const matchingRoute = matchingRoutes.reduce((a, b) =>
    b.pattern.source.length > a.pattern.source.length ? b : a,
  );

  return matchingRoute;
}

/**
 * Gets the default asset (USDC) for the given network
 *
 * @param network - The network to get the default asset for
 * @returns The default asset
 */
export function getDefaultAsset(network: Network) {
  const chainId = getNetworkId(network);
  const usdc = getUsdcChainConfigForChain(chainId);
  if (!usdc) {
    throw new Error(`Unable to get default asset on ${network}`);
  }
  return {
    address: usdc.usdcAddress,
    decimals: 6,
    eip712: {
      name: usdc.usdcName,
      version: "2",
    },
  };
}

/**
 * Parses the amount from the given price
 *
 * @param price - The price to parse
 * @param network - The network to get the default asset for
 * @returns The parsed amount or an error message
 */
export function processPriceToAtomicAmount(
  price: Price,
  network: Network,
):
  | { maxAmountRequired: string; asset: ERC20TokenAmount["asset"] | SPLTokenAmount["asset"] }
  | { error: string } {
  // Handle USDC amount (string) or token amount (ERC20TokenAmount)
  let maxAmountRequired: string;
  let asset: ERC20TokenAmount["asset"] | SPLTokenAmount["asset"];

  if (typeof price === "string" || typeof price === "number") {
    // USDC amount in dollars
    const parsedAmount = moneySchema.safeParse(price);
    if (!parsedAmount.success) {
      return {
        error: `Invalid price (price: ${price}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`,
      };
    }
    const parsedUsdAmount = parsedAmount.data;
    asset = getDefaultAsset(network);
    maxAmountRequired = (parsedUsdAmount * 10 ** asset.decimals).toString();
  } else {
    // Token amount in atomic units
    maxAmountRequired = price.amount;
    asset = price.asset;
  }

  return {
    maxAmountRequired,
    asset,
  };
}

/**
 * Finds the matching payment requirements for the given payment
 *
 * @param paymentRequirements - The payment requirements to search through
 * @param payment - The payment to match against
 * @returns The matching payment requirements or undefined if no match is found
 */
export function findMatchingPaymentRequirements(
  paymentRequirements: PaymentRequirements[],
  payment: PaymentPayload,
) {
  return paymentRequirements.find(
    value => value.scheme === payment.scheme && value.network === payment.network,
  );
}

/**
 * Decodes the X-PAYMENT-RESPONSE header
 *
 * @param header - The X-PAYMENT-RESPONSE header to decode
 * @returns The decoded payment response
 */
export function decodeXPaymentResponse(header: string) {
  const decoded = safeBase64Decode(header);
  return JSON.parse(decoded) as {
    success: boolean;
    transaction: Hex;
    network: Network;
    payer: Address;
  };
}

/**
 * Builds a framework and scheme agnostic payment requirement list.
 * Used as a util in the middleware for the different x402 frameworks
 *
 * @param network - The network to get the payment requirements for
 * @param scheme - The scheme defined in the route config to get the requirements for
 * @param config - The config for the RouteConfig
 * @param resourceUrl - The URL of the requested route
 * @param payTo - The route defined payment destination
 * @param method - The METHOD for the request
 * @param supported - Async function from the facilitator to get the PaymentKind
 * @param maxAmountRequired - The max amount returned by priceToAtomicAmount
 * @param asset - The asset returned by priceToAtomicAmount
 */
export const buildPaymentRequirementsMiddleware = async ({
  routeConfig: {network, scheme = ExactScheme, config = {}},
  resourceUrl,
  payTo,
  method,
  supported,
  maxAmountRequired,
  asset,
}: PaymentRequirementsMiddleware): Promise<PaymentRequirements[]> => {
  const {
    description,
    mimeType,
    maxTimeoutSeconds,
    inputSchema,
    outputSchema,
    discoverable,
  } = config ;

  if (scheme === DeferredScheme) {
    if (!isDeferredNetwork(network)) {
      throw new Error(`The network supplied is not a deferred network. Supplied: ${network}`)
    }
    return []
  }

  // This is a requirement to build, we know that everything is for exact schema because of the statement above
  const exactSchema = scheme as typeof ExactScheme;
  const exactNetwork = network as ExactNetwork;

  if (SupportedEVMNetworks.includes(exactNetwork)) {
    return [{
      scheme: exactSchema,
      network: exactNetwork,
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
      extra: (asset as ERC20TokenAmount["asset"]).eip712,
    }]
  }
  // svm networks
  if (SupportedSVMNetworks.includes(network as ExactNetwork)) {
    // network call to get the supported payments from the facilitator
    const paymentKinds = await supported();

    // find the payment kind that matches the network and scheme
    let feePayer: string | undefined;
    for (const kind of paymentKinds.kinds) {
      if (kind.network === network && kind.scheme === scheme) {
        feePayer = kind?.extra?.feePayer;
        break;
      }
    }

    // svm networks require a fee payer
    if (!feePayer) {
      throw new Error(`The facilitator did not provide a fee payer for network: ${network}.`);
    }

    // build the payment requirements for svm
    return [{
      scheme: exactSchema,
      network: exactNetwork,
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
          ...inputSchema,
        },
        output: outputSchema,
      },
      extra: {
        feePayer,
      },
    }];
  }

  throw new Error(`Unsupported network: ${network}`);
}

