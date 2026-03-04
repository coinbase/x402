import type {
  SchemeNetworkServer,
  PaymentRequirements,
  Price,
  AssetAmount,
  Network,
  MoneyParser,
} from "@x402/core/types";
import { HYPERCORE_NETWORK_CONFIGS, type HypercoreAssetInfo } from "../../constants.js";

/**
 * Hypercore scheme server implementation.
 */
export class ExactHypercoreScheme implements SchemeNetworkServer {
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
   * @returns The server instance for chaining
   *
   * @example
   * hypercoreServer.registerMoneyParser(async (amount, network) => {
   *   // Custom conversion logic
   *   if (amount > 100) {
   *     // Use different token for large amounts
   *     return { amount: (amount * 1e18).toString(), asset: "CUSTOM:0x..." };
   *   }
   *   return null; // Use next parser
   * });
   */
  registerMoneyParser(parser: MoneyParser): ExactHypercoreScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parse a price into an asset amount.
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
        throw new Error(`Asset must be specified for AssetAmount on network ${network}`);
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      };
    }

    // Parse Money to decimal number
    const amount = this.parseMoneyToDecimal(price as string | number);

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
   * Add Hypercore-specific metadata to requirements.
   *
   * @param paymentRequirements - Base requirements.
   * @param supportedKind - Supported kind info.
   * @param supportedKind.x402Version - Protocol version.
   * @param supportedKind.scheme - Scheme name.
   * @param supportedKind.network - Network identifier.
   * @param supportedKind.extra - Extra metadata.
   * @param _ - Facilitator extensions.
   * @returns Enhanced requirements.
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    _: string[],
  ): Promise<PaymentRequirements> {
    return {
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        signatureChainId: 999,
        isMainnet: supportedKind.network === "hypercore:mainnet",
      },
    };
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
   * Converts decimal amount to the default token on the specified network.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in the default token
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const assetInfo = this.getDefaultAsset(network);
    const tokenAmount = this.convertToTokenAmount(amount.toString(), assetInfo.decimals);

    return {
      amount: tokenAmount,
      asset: assetInfo.token,
      extra: {
        name: assetInfo.name,
      },
    };
  }

  /**
   * Convert decimal amount to token units (e.g., 0.10 -> 100000 for 6-decimal tokens)
   *
   * @param decimalAmount - The decimal amount to convert
   * @param decimals - The number of decimals for the token
   * @returns The token amount as a string
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
    const amount = parseFloat(decimalAmount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`);
    }
    const amountInt = Math.floor(amount * Math.pow(10, decimals));
    return amountInt.toString();
  }

  /**
   * Get the default asset info for a network
   *
   * @param network - The network to get asset info for
   * @returns The asset information including token, name, and decimals
   */
  private getDefaultAsset(network: Network): HypercoreAssetInfo {
    const config = HYPERCORE_NETWORK_CONFIGS[network];
    if (!config) {
      throw new Error(`No default asset configured for network ${network}`);
    }
    return config.defaultAsset;
  }
}
