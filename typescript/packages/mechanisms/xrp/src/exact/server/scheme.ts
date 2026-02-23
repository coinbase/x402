/**
 * XRP Server Scheme Implementation
 * 
 * Implements SchemeNetworkServer for the Exact payment scheme on XRP
 */

import {
  AssetAmount,
  Network,
  PaymentRequirements,
  SchemeNetworkServer,
  MoneyParser,
  Price,
} from "@x402/core/types";

/**
 * XRP server implementation for the Exact payment scheme.
 */
export class ExactXrpScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];

  /**
   * Register a custom money parser in the parser chain.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The server instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): ExactXrpScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parses a price into an asset amount.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns Promise that resolves to the parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    // If already an AssetAmount, return it directly
    if (typeof price === "object" && price !== null && "amount" in price) {
      return {
        amount: price.amount,
        asset: price.asset || "XRP",
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
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator
   * @param extensionKeys - Extension keys supported by the facilitator
   * @returns Payment requirements ready to be sent to clients
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    _supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    _extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    // XRP doesn't need enhancement - return as-is
    return paymentRequirements;
  }

  /**
   * Parse Money (string | number) to a decimal number.
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
   * Converts decimal amount to drops of XRP.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in XRP drops
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    // Get base reserve for network to know minimum payment
    const baseReserve = this.getBaseReserve(network);

    // Convert to drops (1 XRP = 1,000,000 drops)
    // But ensure payment is at least meaningful relative to reserve
    const minimumXrp = Math.max(0.000001, baseReserve * 0.001); // 0.1% of reserve minimum
    const actualAmount = Math.max(amount, minimumXrp);

    const drops = Math.round(actualAmount * 1000000).toString();

    return {
      amount: drops,
      asset: "XRP",
      extra: {
        name: "XRP",
        decimals: 6,
      },
    };
  }

  /**
   * Get the base reserve for the specified network
   *
   * @param network - The network to get reserve for
   * @returns Base reserve in XRP
   */
  private getBaseReserve(network: Network): number {
    switch (network) {
      case "xrp:mainnet":
        return 10;
      case "xrp:testnet":
      case "xrp:devnet":
        return 1;
      default:
        if (network.startsWith("xrp:")) {
          return 1; // Default for unknown xrp networks
        }
        throw new Error(`Not an XRP network: ${network}`);
    }
  }
}
