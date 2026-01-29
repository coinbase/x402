import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
} from "@x402/core/types";

/**
 * Concordium asset information
 */
export type AssetType = "native" | "plt";

export interface ConcordiumAssetInfo {
  type: AssetType;
  symbol: string;
  decimals: number;
}

/**
 * Native CCD asset
 */
export const CCD_NATIVE: ConcordiumAssetInfo = {
  type: "native",
  symbol: "CCD",
  decimals: 6,
};

/**
 * Concordium server scheme for exact payments.
 *
 * Supports:
 * - Native CCD (type: "native")
 * - PLT tokens (type: "plt")
 */
export class ExactConcordiumScheme implements SchemeNetworkServer {
  readonly scheme = "exact";

  /** Registered assets: Map<"network:SYMBOL", AssetInfo> */
  private assets = new Map<string, ConcordiumAssetInfo>();

  /**
   * Register an asset for a network.
   *
   * @param network - Network identifier (e.g., "ccd:9dd9ca4d..." or "ccd:*")
   * @param symbol - Asset symbol (e.g., "EURR", "USDC")
   * @param decimals - Number of decimal places
   * @returns This instance for chaining
   * @example
   * ```typescript
   * scheme.registerAsset('ccd:9dd9ca4d19e9393877d2c44b70f89acb', 'EURR', 6);
   * ```
   */
  registerAsset(network: Network, symbol: string, decimals: number): this {
    const asset: ConcordiumAssetInfo = {
      type: "plt",
      symbol: symbol.toUpperCase(),
      decimals,
    };
    this.assets.set(this.assetKey(network, symbol), asset);
    return this;
  }

  /**
   * Get registered asset.
   *
   * @param network - Network identifier
   * @param symbol - Asset symbol
   * @returns Asset info or undefined if not found
   */
  getAsset(network: Network, symbol: string): ConcordiumAssetInfo | undefined {
    const exact = this.assets.get(this.assetKey(network, symbol));
    if (exact) return exact;

    return this.assets.get(this.assetKey("ccd:*", symbol));
  }

  /**
   * Get all supported assets for a network.
   * Always includes native CCD.
   *
   * @param network - Network identifier
   * @returns Array of supported assets
   */
  getSupportedAssets(network: Network): ConcordiumAssetInfo[] {
    const assets: ConcordiumAssetInfo[] = [CCD_NATIVE];

    for (const [key, asset] of this.assets.entries()) {
      if (key.startsWith(`${network}:`) || key.startsWith("ccd:*:")) {
        if (!assets.some(a => a.symbol === asset.symbol)) {
          assets.push(asset);
        }
      }
    }

    return assets;
  }

  /**
   * Get supported asset symbols for a network.
   * Always includes "CCD".
   *
   * @param network - Network identifier
   * @returns Array of supported symbols
   */
  getSupportedSymbols(network: Network): string[] {
    return this.getSupportedAssets(network).map(a => a.symbol);
  }

  /**
   * Parse price into AssetAmount.
   *
   * Supports:
   * - String/number: "10" or 10 -> CCD with decimals
   * - AssetAmount: { amount: "10", asset: "EURR" } -> PLT without decimals
   *
   * @param price - Price to parse
   * @param network - Network identifier
   * @returns Parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (this.isAssetAmount(price)) {
      return this.parseAssetAmount(price, network);
    }

    if (typeof price === "string" && price.startsWith("$")) {
      throw new Error(`USD prices not supported. Got: ${price}`);
    }

    const amount = this.toSmallestUnits(price, CCD_NATIVE.decimals);

    return {
      amount,
      asset: "",
      extra: { type: "native", symbol: "CCD", decimals: 6 },
    };
  }

  /**
   * Enhance payment requirements (no-op for Concordium).
   *
   * @param requirements - Payment requirements to enhance
   * @param _supportedKind - Supported payment kind configuration (unused)
   * @param _supportedKind.x402Version - X402 protocol version (unused)
   * @param _supportedKind.scheme - Payment scheme identifier (unused)
   * @param _supportedKind.network - Network identifier (unused)
   * @param _supportedKind.extra - Extra configuration options (unused)
   * @param _extensionKeys - Extension keys to apply (unused)
   * @returns Enhanced payment requirements
   */
  enhancePaymentRequirements(
    requirements: PaymentRequirements,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _supportedKind: {
      x402Version: number;
      scheme: string;
      network: Network;
      extra?: Record<string, unknown>;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _extensionKeys: string[],
  ): Promise<PaymentRequirements> {
    return Promise.resolve(requirements);
  }

  /**
   * Parse custom asset amount.
   *
   * @param price - Asset amount to parse
   * @param network - Network identifier
   * @returns Parsed asset amount
   */
  private parseAssetAmount(price: AssetAmount, network: Network): AssetAmount {
    const assetSymbol = price.asset || "";

    if (!assetSymbol || assetSymbol.toUpperCase() === "CCD") {
      const amount = this.toSmallestUnits(price.amount, CCD_NATIVE.decimals);
      return {
        amount,
        asset: "",
        extra: {
          type: "native",
          symbol: "CCD",
          decimals: 6,
          ...price.extra,
        },
      };
    }

    const asset = this.getAsset(network, assetSymbol);
    if (!asset) {
      throw new Error(`Unknown asset: ${assetSymbol}`);
    }

    return {
      amount: this.toWholeUnits(price.amount),
      asset: asset.symbol,
      extra: {
        type: asset.type,
        symbol: asset.symbol,
        decimals: asset.decimals,
        ...price.extra,
      },
    };
  }

  /**
   * Creates a unique key for asset lookup.
   *
   * @param network - Network identifier
   * @param symbol - Asset symbol
   * @returns Asset key string
   */
  private assetKey(network: Network, symbol: string): string {
    return `${network}:${symbol.toUpperCase()}`;
  }

  /**
   * Resolves asset info from extra metadata.
   *
   * @param network - Network identifier
   * @param extra - Extra metadata containing asset info
   * @returns Resolved asset info
   */
  private resolveAsset(network: Network, extra?: Record<string, unknown>): ConcordiumAssetInfo {
    if (!extra?.asset) {
      return CCD_NATIVE;
    }

    const symbol = extra.asset;

    if (typeof symbol !== "string") {
      throw new Error(`extra.asset must be a string symbol. Got: ${typeof symbol}`);
    }

    if (symbol.toUpperCase() === "CCD") {
      return CCD_NATIVE;
    }

    const asset = this.getAsset(network, symbol);
    if (!asset) {
      const supported = this.getSupportedSymbols(network);
      throw new Error(
        `Unknown asset "${symbol}" on ${network}. ` +
          `Registered: CCD${supported.length ? ", " + supported.join(", ") : ""}. ` +
          `Use registerAsset() to add.`,
      );
    }

    return asset;
  }

  /**
   * Convert human-readable amount to the smallest units.
   *
   * @param amount - Human-readable amount
   * @param decimals - Number of decimal places
   * @returns Amount in smallest units
   * @example
   * toSmallestUnits("10", 6) // "10000000"
   * toSmallestUnits("10.5", 6) // "10500000"
   * toSmallestUnits(10, 6) // "10000000"
   */
  private toSmallestUnits(amount: string | number, decimals: number): string {
    const str = String(amount).trim();

    if (!/^\d+(\.\d+)?$/.test(str)) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    const [whole, fraction = ""] = str.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);

    return (whole + paddedFraction).replace(/^0+/, "") || "0";
  }

  /**
   * Convert to whole units (for PLT).
   *
   * @param amount - Amount to convert
   * @returns Whole units as string
   * @example
   * toWholeUnits("10.5") // "10"
   */
  private toWholeUnits(amount: string | number): string {
    const str = String(amount).trim();

    if (!/^\d+(\.\d+)?$/.test(str)) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    const [whole] = str.split(".");
    return whole.replace(/^0+/, "") || "0";
  }

  /**
   * Convert the smallest units to human-readable amount.
   *
   * @param amount - Amount in smallest units
   * @param decimals - Number of decimal places
   * @returns Human-readable amount
   * @example
   * fromSmallestUnits("10000000", 6) // "10"
   * fromSmallestUnits("10500000", 6) // "10.5"
   * fromSmallestUnits("1", 6) // "0.000001"
   */
  private fromSmallestUnits(amount: string, decimals: number): string {
    const str = String(amount).trim();

    if (!/^\d+$/.test(str)) {
      throw new Error(`Invalid amount: ${amount}`);
    }

    if (str === "0" || decimals === 0) {
      return str;
    }

    const padded = str.padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals).replace(/^0+/, "") || "0";
    const fraction = padded.slice(-decimals).replace(/0+$/, "");

    return fraction ? `${whole}.${fraction}` : whole;
  }

  /**
   * Type guard to check if price is an AssetAmount.
   *
   * @param price - Price to check
   * @returns True if price is an AssetAmount
   */
  private isAssetAmount(price: Price): price is AssetAmount {
    return typeof price === "object" && price !== null && "amount" in price;
  }

  /**
   * Validates an asset amount object.
   *
   * @param price - Asset amount containing amount and optional asset symbol
   * @param price.amount - The amount as a string of digits
   * @param price.asset - Optional asset symbol identifier
   */
  private validateAssetAmount(price: { amount: string; asset?: string }): void {
    if (!price.amount || !/^\d+$/.test(price.amount)) {
      throw new Error(`Invalid amount: ${price.amount}`);
    }
  }
}
