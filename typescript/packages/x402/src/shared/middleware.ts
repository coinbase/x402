import { Address, Hex, getAddress } from "viem";
import {
  moneySchema,
  Network,
  Price,
  RouteConfig,
  RoutePattern,
  ERC20TokenAmount,
  PaymentRequirements,
  PaymentPayload,
  SPLTokenAmount,
  Resource,
  SupportedEVMNetworks,
  SupportedSVMNetworks,
  SupportedPaymentKindsResponse,
} from "../types";
import { RoutesConfig } from "../types";
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
 * Builds PaymentRequirements for the given route configuration in a single, shared helper.
 * (to consolidates EVM/SVM branching)
 *
 * @param params - Parameters object
 * @param params.price - Price in USD (string/number) or token amount object
 * @param params.network - Target network (e.g., "base", "base-sepolia", "solana-devnet")
 * @param params.method - HTTP verb to embed in request structure
 * @param params.resourceUrl - Fully-qualified resource URL for the protected endpoint
 * @param params.payTo - Recipient address (EVM or SVM)
 * @param params.description - Optional human-readable description
 * @param params.mimeType - Optional mime type for the protected response
 * @param params.maxTimeoutSeconds - Optional payment validity window in seconds
 * @param params.inputSchema - Optional input schema metadata to include in outputSchema.input
 * @param params.outputSchema - Optional output schema metadata
 * @param params.discoverable - Whether the resource should be discoverable
 * @param params.getSupportedKinds - Callback to fetch supported kinds (used to obtain SVM fee payer)
 * @param params.defaultEvmTimeoutSeconds - Default EVM timeout when not provided
 * @param params.defaultSvmTimeoutSeconds - Default SVM timeout when not provided
 * @param params.defaultMimeType - Default mime type when not provided
 * @returns A single-element array containing the constructed PaymentRequirements
 */
export async function buildPaymentRequirements(params: {
  price: Price;
  network: Network;
  method: string;
  resourceUrl: Resource;
  payTo: string;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  inputSchema?: Record<string, unknown> | object;
  outputSchema?: Record<string, unknown> | object;
  discoverable?: boolean;
  getSupportedKinds?: () => Promise<SupportedPaymentKindsResponse>;
  defaultEvmTimeoutSeconds?: number;
  defaultSvmTimeoutSeconds?: number;
  defaultMimeType?: string;
}): Promise<PaymentRequirements[]> {
  const {
    price,
    network,
    method,
    resourceUrl,
    payTo,
    description,
    mimeType,
    maxTimeoutSeconds,
    inputSchema,
    outputSchema,
    discoverable,
    getSupportedKinds,
  } = params;

  const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
  if ("error" in atomicAmountForAsset) {
    throw new Error(atomicAmountForAsset.error);
  }

  const { maxAmountRequired, asset } = atomicAmountForAsset;

  const isEvmNetwork = SupportedEVMNetworks.includes(network);
  const networkDefaultTimeout = isEvmNetwork ? 300 : 60;
  const finalTimeout =
    typeof maxTimeoutSeconds === "number" ? maxTimeoutSeconds : networkDefaultTimeout;
  const finalMimeType =
    typeof mimeType === "string" ? mimeType : isEvmNetwork ? "application/json" : "";

  // EVM networks
  if (SupportedEVMNetworks.includes(network)) {
    return [
      {
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: finalMimeType,
        payTo: getAddress(payTo),
        maxTimeoutSeconds: finalTimeout,
        asset: getAddress((asset as ERC20TokenAmount["asset"]).address),
        outputSchema: {
          input: {
            type: "http",
            method,
            discoverable: discoverable ?? true,
            ...((inputSchema as Record<string, unknown> | undefined) || {}),
          },
          output: outputSchema as Record<string, unknown> | undefined,
        },
        extra: (asset as ERC20TokenAmount["asset"]).eip712,
      },
    ];
  }

  // SVM networks
  if (SupportedSVMNetworks.includes(network)) {
    if (!getSupportedKinds) {
      throw new Error(`The facilitator did not provide a fee payer for network: ${network}.`);
    }
    const kinds = await getSupportedKinds();
    let feePayer: string | undefined;
    for (const kind of kinds.kinds) {
      if (kind.network === network && kind.scheme === "exact") {
        const extra = (kind as { extra?: Record<string, unknown> }).extra;
        const maybeFeePayer = extra?.["feePayer"];
        if (typeof maybeFeePayer === "string") {
          feePayer = maybeFeePayer;
        }
        break;
      }
    }

    if (!feePayer) {
      throw new Error(`The facilitator did not provide a fee payer for network: ${network}.`);
    }

    return [
      {
        scheme: "exact",
        network,
        maxAmountRequired,
        resource: resourceUrl,
        description: description ?? "",
        mimeType: finalMimeType,
        payTo: payTo,
        maxTimeoutSeconds: finalTimeout,
        asset: (asset as { address: string }).address,
        outputSchema: {
          input: {
            type: "http",
            method,
            discoverable: discoverable ?? true,
            ...((inputSchema as Record<string, unknown> | undefined) || {}),
          },
          output: outputSchema as Record<string, unknown> | undefined,
        },
        extra: { feePayer },
      },
    ];
  }

  throw new Error(`Unsupported network: ${network}`);
}
