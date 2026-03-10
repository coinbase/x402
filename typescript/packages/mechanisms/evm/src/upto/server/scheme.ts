import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
} from "@x402/core/types";

export class UptoEvmScheme implements SchemeNetworkServer {
  readonly scheme = "upto";
  private moneyParsers: MoneyParser[] = [];

  registerMoneyParser(parser: MoneyParser): UptoEvmScheme {
    this.moneyParsers.push(parser);
    return this;
  }

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
