import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
} from "@x402/core/types";

/**
 * EVM server implementation for the Upto payment scheme.
 * Handles price parsing, payment requirements enhancement, and default asset resolution.
 */
export class UptoEvmScheme implements SchemeNetworkServer {
  readonly scheme = "upto";
  private moneyParsers: MoneyParser[] = [];

  /**
   * Registers a custom money parser for converting prices to asset amounts.
   *
   * @param parser - The money parser function to register
   * @returns This instance for chaining
   */
  registerMoneyParser(parser: MoneyParser): UptoEvmScheme {
    this.moneyParsers.push(parser);
    return this;
  }

  /**
   * Parses a price into an asset amount for the given network.
   *
   * @param price - The price to parse (string, number, or AssetAmount)
   * @param network - The target network
   * @returns Promise resolving to an asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
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

    const amount = this.parseMoneyToDecimal(price);

    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network);
      if (result !== null) {
        return result;
      }
    }

    return this.defaultMoneyConversion(amount, network);
  }

  /**
   * Enhances payment requirements with upto-specific metadata.
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported scheme/network kind
   * @param supportedKind.x402Version - The x402 protocol version
   * @param supportedKind.scheme - The payment scheme name
   * @param supportedKind.network - The target network
   * @param supportedKind.extra - Optional extra metadata
   * @param extensionKeys - Extension keys to include
   * @returns Promise resolving to enhanced payment requirements
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
    void supportedKind;
    void extensionKeys;
    return Promise.resolve({
      ...paymentRequirements,
      extra: {
        ...paymentRequirements.extra,
        assetTransferMethod: "permit2",
      },
    });
  }

  /**
   * Parses a money string or number into a decimal value.
   *
   * @param money - The money value to parse
   * @returns The parsed decimal amount
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === "number") {
      return money;
    }

    const cleanMoney = money.replace(/^\$/, "").trim();
    const amount = parseFloat(cleanMoney);

    if (isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`);
    }

    return amount;
  }

  /**
   * Converts a decimal amount to an asset amount using the default stablecoin for the network.
   *
   * @param amount - The decimal amount to convert
   * @param network - The target network
   * @returns The converted asset amount
   */
  private defaultMoneyConversion(amount: number, network: Network): AssetAmount {
    const assetInfo = this.getDefaultAsset(network);
    const tokenAmount = this.convertToTokenAmount(amount.toString(), assetInfo.decimals);

    return {
      amount: tokenAmount,
      asset: assetInfo.address,
      extra: {
        name: assetInfo.name,
        version: assetInfo.version,
        assetTransferMethod: "permit2",
      },
    };
  }

  /**
   * Converts a decimal amount string to the smallest token unit.
   *
   * @param decimalAmount - The decimal amount as a string
   * @param decimals - The number of decimal places for the token
   * @returns The amount in smallest token units as a string
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
    const amount = parseFloat(decimalAmount);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`);
    }
    const [intPart, decPart = ""] = String(amount).split(".");
    const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
    const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
    return tokenAmount;
  }

  /**
   * Returns the default stablecoin asset configuration for the given network.
   *
   * @param network - The target network
   * @returns The default asset info including address, name, version, and decimals
   */
  private getDefaultAsset(network: Network): {
    address: string;
    name: string;
    version: string;
    decimals: number;
  } {
    const stablecoins: Record<
      string,
      { address: string; name: string; version: string; decimals: number }
    > = {
      "eip155:8453": {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
      "eip155:84532": {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name: "USDC",
        version: "2",
        decimals: 6,
      },
      "eip155:4326": {
        address: "0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7",
        name: "MegaUSD",
        version: "1",
        decimals: 18,
      },
      "eip155:143": {
        address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    };

    const assetInfo = stablecoins[network];
    if (!assetInfo) {
      throw new Error(`No default asset configured for network ${network}`);
    }

    return assetInfo;
  }
}
