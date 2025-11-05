import type {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkService,
} from "@x402/core/types";
import { convertToTokenAmount, getUsdcAddress } from "../utils";

/**
 * SVM service implementation for the Exact payment scheme.
 */
export class ExactSvmService implements SchemeNetworkService {
  readonly scheme = "exact";

  /**
   * Parses a price into an asset amount.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns The parsed asset amount
   */
  parsePrice(price: Price, network: Network): AssetAmount {
    // Handle pre-parsed price object
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for price object on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    // Parse string prices like "$0.10" or "0.10 USDC"
    if (typeof price === "string") {
      // Remove $ sign if present
      const cleanPrice = price.replace(/^\$/, "").trim();

      // Check if it contains a currency/asset identifier
      const parts = cleanPrice.split(/\s+/);
      if (parts.length === 2) {
        // Format: "0.10 USDC"
        const amount = convertToTokenAmount(parts[0], 6); // USDC has 6 decimals
        const symbol = parts[1].toUpperCase();

        if (symbol === "USDC" || symbol === "USD") {
          return {
            amount,
            asset: getUsdcAddress(network),
            extra: {},
          };
        } else {
          throw new Error(`Unsupported asset: ${symbol} on network ${network}`);
        }
      } else if (cleanPrice.match(/^\d+(\.\d+)?$/)) {
        // Simple number format like "0.10" - assume USDC
        const amount = convertToTokenAmount(cleanPrice, 6);
        return {
          amount,
          asset: getUsdcAddress(network),
          extra: {},
        };
      } else {
        throw new Error(
          `Invalid price format: ${price}. Must specify currency (e.g., "0.10 USDC") or use simple number format.`,
        );
      }
    }

    // Handle number input - assume USDC
    if (typeof price === "number") {
      const amount = convertToTokenAmount(price.toString(), 6);
      return {
        amount,
        asset: getUsdcAddress(network),
        extra: {},
      };
    }

    throw new Error(`Invalid price format: ${price}`);
  }

  /**
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind configuration
   * @param supportedKind.x402Version - The x402 protocol version
   * @param supportedKind.scheme - The payment scheme
   * @param supportedKind.network - The network identifier
   * @param supportedKind.extra - Extra metadata including feePayer address
   * @param extensionKeys - Extension keys supported by the facilitator
   * @returns Enhanced payment requirements with feePayer in extra
   */
  enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    // Mark unused parameters to satisfy linter
    void extensionKeys;

    // Add feePayer from supportedKind.extra to payment requirements
    // The facilitator provides its address as the fee payer for transaction fees
    return Promise.resolve({
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        feePayer: supportedKind.extra?.feePayer,
      },
    });
  }
}
