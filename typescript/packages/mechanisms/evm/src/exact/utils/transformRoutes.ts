import type { RoutesConfig, RouteConfig, HTTPRequestContext } from "@x402/core/server";
import type { Price, Network, AssetAmount } from "@x402/core/types";
import type { ExactEvmSchemeERC4337 } from "../server/erc4337";
import type { PaymentOption, DynamicPrice } from "@x402/core/http";
import type { UserOperationCapability } from "../../erc4337/types";

/**
 * Transforms routes to move userOperation from PaymentOption.extra to price.extra.
 *
 * This transformation enables userOperation to flow through the natural price.extra
 * path into PaymentRequirements.extra, allowing the official middleware to work
 * without modification.
 *
 * This is a workaround to allow the official middleware to work without modification.
 * and support this proposal https://github.com/coinbase/x402/issues/639
 *
 * @param routes - The routes configuration to transform
 * @param schemeServer - The ERC-4337 scheme server instance
 * @returns The transformed routes configuration
 */
export async function transformRoutesForUserOperation(
  routes: RoutesConfig,
  schemeServer: ExactEvmSchemeERC4337,
): Promise<RoutesConfig> {
  // Handle single RouteConfig
  if ("accepts" in routes) {
    return await transformRouteForUserOperation(routes as RouteConfig, schemeServer);
  }

  // Handle RoutesConfig object (Record<string, RouteConfig>)
  const transformed: Record<string, RouteConfig> = {};
  for (const [path, routeConfig] of Object.entries(routes as Record<string, RouteConfig>)) {
    transformed[path] = await transformRouteForUserOperation(routeConfig, schemeServer);
  }
  return transformed;
}

/**
 * Transforms a single RouteConfig to move userOperation from PaymentOption.extra to price.extra.
 *
 * @param routeConfig - The route configuration to transform
 * @param schemeServer - The ERC-4337 scheme server instance
 * @returns The transformed route configuration
 */
export async function transformRouteForUserOperation(
  routeConfig: RouteConfig,
  schemeServer: ExactEvmSchemeERC4337,
): Promise<RouteConfig> {
  // Handle single PaymentOption
  if (!Array.isArray(routeConfig.accepts)) {
    return {
      ...routeConfig,
      accepts: await transformPaymentOption(routeConfig.accepts, schemeServer),
    };
  }

  // Handle array of PaymentOptions
  const transformedAccepts = await Promise.all(
    routeConfig.accepts.map((option: PaymentOption) =>
      transformPaymentOption(option, schemeServer),
    ),
  );

  return {
    ...routeConfig,
    accepts: transformedAccepts,
  };
}

/**
 * Transforms a PaymentOption to move userOperation from extra to price.extra.
 *
 * @param option - The payment option to transform
 * @param schemeServer - The ERC-4337 scheme server instance
 * @returns The transformed payment option
 */
async function transformPaymentOption(
  option: PaymentOption,
  schemeServer: ExactEvmSchemeERC4337,
): Promise<PaymentOption> {
  // Extract userOperation from PaymentOption.extra
  const userOperation = option.extra?.userOperation as UserOperationCapability | undefined;

  // If no userOperation, return option as-is
  if (!userOperation || !userOperation.supported) {
    return option;
  }

  // Transform price to include userOperation in extra
  const transformedPrice = await transformPrice(
    option.price,
    option.network,
    userOperation,
    schemeServer,
  );

  // Remove userOperation from PaymentOption.extra
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userOperation: _, ...restExtra } = option.extra || {};

  return {
    ...option,
    price: transformedPrice,
    extra: Object.keys(restExtra).length > 0 ? restExtra : undefined,
  };
}

/**
 * Transforms a price to include userOperation in its extra field.
 *
 * @param price - The price to transform
 * @param network - The network identifier
 * @param userOperation - The UserOperation capability to inject
 * @param schemeServer - The ERC-4337 scheme server instance
 * @returns The transformed price with UserOperation in extra
 */
async function transformPrice(
  price: Price | DynamicPrice,
  network: Network,
  userOperation: UserOperationCapability,
  schemeServer: ExactEvmSchemeERC4337,
): Promise<Price | DynamicPrice> {
  // Handle function price (DynamicPrice)
  if (typeof price === "function") {
    return async (context: HTTPRequestContext): Promise<Price> => {
      const resolvedPrice = await price(context);
      return await injectUserOperationIntoPrice(
        resolvedPrice,
        network,
        userOperation,
        schemeServer,
      );
    };
  }

  // Handle static price (string, number, or AssetAmount)
  return await injectUserOperationIntoPrice(price, network, userOperation, schemeServer);
}

/**
 * Injects userOperation into a price's extra field.
 * Handles both string/number prices (parsed to AssetAmount) and AssetAmount prices.
 *
 * @param price - The price to inject into
 * @param network - The network identifier
 * @param userOperation - The UserOperation capability to inject
 * @param schemeServer - The ERC-4337 scheme server instance
 * @returns The price with UserOperation injected in extra
 */
async function injectUserOperationIntoPrice(
  price: Price,
  network: Network,
  userOperation: UserOperationCapability,
  schemeServer: ExactEvmSchemeERC4337,
): Promise<Price> {
  // If price is already an AssetAmount, add userOperation to extra
  if (typeof price === "object" && "asset" in price && "amount" in price) {
    const assetAmount = price as AssetAmount;
    return {
      ...assetAmount,
      extra: {
        ...assetAmount.extra,
        userOperation,
      },
    };
  }

  // If price is string or number, parse it to AssetAmount
  const assetAmount = await schemeServer.parsePrice(price, network);

  return {
    ...assetAmount,
    extra: {
      ...assetAmount.extra,
      userOperation,
    },
  };
}
