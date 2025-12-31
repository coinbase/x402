import type {
  AssetAmount,
  MoneyParser,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
} from "@x402/core/types";
import { APTOS_ADDRESS_REGEX } from "../../constants";

/**
 * Default APT fungible asset metadata address on mainnet.
 * This is the wrapped APT (wAPT) for use with the fungible asset framework.
 */
const APT_MAINNET_FA = "0x000000000000000000000000000000000000000000000000000000000000000a";

/**
 * Default APT fungible asset metadata address on testnet.
 */
const APT_TESTNET_FA = "0x000000000000000000000000000000000000000000000000000000000000000a";

/**
 * Aptos server implementation for the Exact payment scheme.
 * Provides money parsing and requirement enhancement for Aptos payments.
 */
export class ExactAptosScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];

  /**
   * Register a custom money parser in the parser chain.
   * Multiple parsers can be registered - they will be tried in registration order.
   * Each parser receives a decimal amount (e.g., 1.50 for $1.50).
   * If a parser returns null, the next parser in the chain will be tried.
   * The default parser is always the final fallback.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The service instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): ExactAptosScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parses a price into an asset amount.
   * If price is already an AssetAmount, returns it directly.
   * If price is Money (string | number), parses to decimal and tries custom parsers.
   * Falls back to default conversion if all custom parsers return null.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns Promise that resolves to the parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    // If already an AssetAmount, return it directly
    if (typeof price === "object" && price !== null && "amount" in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`);
      }
      if (!APTOS_ADDRESS_REGEX.test(price.asset)) {
        throw new Error(`Invalid asset address format: ${price.asset}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    // Parse Money to decimal number
    const amount = this.parseMoneyToDecimal(price);

    // Try each custom money parser in order
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    // All custom parsers returned null, use default conversion
    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Build payment requirements for this scheme/network combination.
   * For Aptos, adds the sponsored flag from the facilitator's extra data.
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind configuration from facilitator
   * @param supportedKind.x402Version - The x402 protocol version
   * @param supportedKind.scheme - The payment scheme
   * @param supportedKind.network - The network identifier
   * @param supportedKind.extra - Extra metadata including sponsored flag
   * @param extensionKeys - Extension keys supported by the facilitator
   * @returns Enhanced payment requirements with sponsored flag in extra
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

    // Add sponsored flag from supportedKind.extra to payment requirements
    // The facilitator indicates whether it supports sponsored transactions
    return Promise.resolve({
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        sponsored: supportedKind.extra?.sponsored ?? false,
      },
    });
  }

  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   *
   * @param money - The money value to parse
   * @returns Decimal number
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }

    // Remove $ sign and whitespace, then parse
    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);

    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }

    return amount;
  }

  /**
   * Default money conversion implementation.
   * Converts decimal amount to APT on the specified network.
   * APT has 8 decimals.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in APT
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    // APT has 8 decimals
    const decimals = 8;
    const tokenAmount = this.convertToTokenAmount(amount.toString(), decimals);

    // Get APT fungible asset address for the network
    const asset = network === "aptos:2" ? APT_TESTNET_FA : APT_MAINNET_FA;

    return {
      amount: tokenAmount,
      asset,
      extra: {},
    };
  }

  /**
   * Convert a decimal amount string to a token amount string.
   *
   * @param amount - The decimal amount (e.g., "1.5")
   * @param decimals - Number of decimals for the token
   * @returns The amount in atomic units as a string
   */
  private convertToTokenAmount(amount: string, decimals: number): string {
    const parts = amount.split(".");
    const wholePart = parts[0] || "0";
    const fractionalPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return BigInt(wholePart + fractionalPart).toString();
  }
}
