import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkService,
} from "@x402/core/types";

/**
 * EVM service implementation for the Exact payment scheme.
 */
export class ExactEvmService implements SchemeNetworkService {
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
        const amount = this.convertToTokenAmount(parts[0], network);
        const assetInfo = this.getAssetInfo(parts[1], network);
        return {
          amount,
          asset: assetInfo.address,
          extra: {
            name: assetInfo.name,
            version: assetInfo.version,
          },
        };
      } else if (cleanPrice.match(/^\d+(\.\d+)?$/)) {
        // Simple number format like "0.10" - assume USD/USDC
        const amount = this.convertToTokenAmount(cleanPrice, network);
        const assetInfo = this.getDefaultAsset(network);
        return {
          amount,
          asset: assetInfo.address,
          extra: {
            name: assetInfo.name,
            version: assetInfo.version,
          },
        };
      } else {
        throw new Error(
          `Invalid price format: ${price}. Must specify currency (e.g., "0.10 USDC") or use simple number format.`,
        );
      }
    }

    // Handle number input - assume USD/USDC
    if (typeof price === "number") {
      const amount = this.convertToTokenAmount(price.toString(), network);
      const assetInfo = this.getDefaultAsset(network);
      return {
        amount,
        asset: assetInfo.address,
        extra: {
          name: assetInfo.name,
          version: assetInfo.version,
        },
      };
    }

    throw new Error(`Invalid price format: ${price}`);
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
    const tokenAmount = Math.floor(amount * Math.pow(10, decimals));
    return tokenAmount.toString();
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
