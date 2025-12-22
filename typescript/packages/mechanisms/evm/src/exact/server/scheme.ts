import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
} from "@x402/core/types";

/**
 * EVM server implementation for the Exact payment scheme.
 */
export class ExactEvmScheme implements SchemeNetworkServer {
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
   * evmServer.registerMoneyParser(async (amount, network) => {
   *   // Custom conversion logic
   *   if (amount > 100) {
   *     // Use different token for large amounts
   *     return { amount: (amount * 1e18).toString(), asset: "0xCustomToken" };
   *   }
   *   return null; // Use next parser
   * });
   */
  registerMoneyParser(parser: MoneyParser): ExactEvmScheme {
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
   * Build payment requirements for this scheme/network combination
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator (unused)
   * @param supportedKind.x402Version - The x402 version
   * @param supportedKind.scheme - The logical payment scheme
   * @param supportedKind.network - The network identifier in CAIP-2 format
   * @param supportedKind.extra - Optional extra metadata regarding scheme/network implementation details
   * @param extensionKeys - Extension keys supported by the facilitator (unused)
   * @returns Payment requirements ready to be sent to clients
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
    void supportedKind;
    void extensionKeys;
    return Promise.resolve(paymentRequirements);
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
   * Converts decimal amount to USDC on the specified network.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in USDC
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    // Convert decimal amount to token amount (USDC has 6 decimals)
    const tokenAmount = this.convertToTokenAmount(amount.toString(), network);
    const assetInfo = this.getDefaultAsset(network);

    return {
      amount: tokenAmount,
      asset: assetInfo.address,
      extra: {
        name: assetInfo.name,
        version: assetInfo.version,
      },
    };
  }

  /**
   * Convert decimal amount to token units (e.g., 0.10 -> 100000 for 6-decimal USDC)
   *
   * @param decimalAmount - The decimal amount to convert
   * @param network - The network to use
   * @returns The token amount as a string
   */
  private convertToTokenAmount(decimalAmount: string, network: Network): string {
    const decimals = this.getAssetDecimals(network);
    const amount = parseFloat(decimalAmount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`);
    }
    // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
    const [intPart, decPart = ""] = String(amount).split(".");
    const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
    const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
    return tokenAmount;
  }

  /**
   * Get the default asset info for a network (typically USDC)
   *
   * @param network - The network to get asset info for
   * @returns The asset information including address, name, and version
   */
  private getDefaultAsset(network: Network): { address: string; name: string; version: string } {
    // Map of network to USDC info including EIP-712 domain parameters
    const usdcInfo: Record<string, { address: string; name: string; version: string }> = {
      "eip155:8453": {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
      }, // Base mainnet USDC
      "eip155:84532": {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name: "USDC",
        version: "2",
      }, // Base Sepolia USDC
      "eip155:1": {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        name: "USD Coin",
        version: "2",
      }, // Ethereum mainnet USDC
      "eip155:11155111": {
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        name: "USDC",
        version: "2",
      }, // Sepolia USDC
    };

    const assetInfo = usdcInfo[network];
    if (!assetInfo) {
      throw new Error(`No default asset configured for network ${network}`);
    }

    return assetInfo;
  }

  /**
   * Get asset info for a given symbol on a network
   *
   * @param symbol - The asset symbol
   * @param network - The network to use
   * @returns The asset information including address, name, and version
   */
  private getAssetInfo(
    symbol: string,
    network: Network,
  ): { address: string; name: string; version: string } {
    const upperSymbol = symbol.toUpperCase();

    // For now, only support USDC
    if (upperSymbol === "USDC" || upperSymbol === "USD") {
      return this.getDefaultAsset(network);
    }

    // Could extend to support other tokens
    throw new Error(`Unsupported asset: ${symbol} on network ${network}`);
  }

  /**
   * Get the number of decimals for the asset
   *
   * @param _ - The network to use (unused)
   * @returns The number of decimals for the asset
   */
  private getAssetDecimals(_: Network): number {
    // USDC has 6 decimals on all EVM chains
    return 6;
  }
}
