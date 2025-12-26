import {
  AssetAmount,
  Network,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
  MoneyParser,
} from "@x402/core/types";
import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { mainnet, base, baseSepolia, sepolia } from "viem/chains";

/**
 * ERC20 ABI for reading decimals
 */
const erc20Abi = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * EVM server implementation for the Exact payment scheme.
 */
export class ExactEvmScheme implements SchemeNetworkServer {
  readonly scheme = "exact";
  private moneyParsers: MoneyParser[] = [];
  // Cache for decimals to avoid repeated RPC calls
  private decimalsCache: Map<string, number> = new Map();
  // Cache for public clients per network
  private publicClients: Map<Network, PublicClient> = new Map();

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
    return await this.defaultMoneyConversion(amount, network);
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
  private async defaultMoneyConversion(amount: number, network: Network): Promise<AssetAmount> {
    const assetInfo = await this.getDefaultAsset(network);
    // Convert decimal amount to token amount using network-specific decimals
    const tokenAmount = this.convertToTokenAmount(amount.toString(), assetInfo.decimals);

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
   * @param decimals - The number of decimals for the token
   * @returns The token amount as a string
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
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
   * Get static asset info (address, name, version) for a network
   *
   * @param network - The network to get asset info for
   * @returns The asset information including address, name, and version
   */
  private getStaticAssetInfo(network: Network): { address: string; name: string; version: string } {
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
   * Get the chain configuration for a network
   *
   * @param network - The network identifier in CAIP-2 format
   * @returns The viem Chain configuration
   */
  private getChainForNetwork(network: Network): Chain | null {
    const chainId = this.getChainIdFromNetwork(network);
    const chainMap: Record<number, Chain> = {
      1: mainnet,
      8453: base,
      84532: baseSepolia,
      11155111: sepolia,
      // BSC (56) and other EVM chains will work dynamically via viem's chain lookup
      // but are not explicitly configured here
    };
    return chainMap[chainId] || null;
  }

  /**
   * Extract chain ID from CAIP-2 network identifier
   *
   * @param network - The network identifier (e.g., "eip155:8453")
   * @returns The numeric chain ID
   */
  private getChainIdFromNetwork(network: Network): number {
    const parts = network.split(":");
    if (parts.length !== 2 || parts[0] !== "eip155") {
      throw new Error(`Invalid network format: ${network}. Expected format: eip155:<chainId>`);
    }
    const chainId = parseInt(parts[1], 10);
    if (isNaN(chainId)) {
      throw new Error(`Invalid chain ID in network: ${network}`);
    }
    return chainId;
  }

  /**
   * Get or create a public client for a network
   *
   * @param network - The network identifier
   * @returns The public client for the network
   */
  private getPublicClient(network: Network): PublicClient | null {
    // Return cached client if available
    if (this.publicClients.has(network)) {
      return this.publicClients.get(network)!;
    }

    // Get chain configuration
    const chain = this.getChainForNetwork(network);
    if (!chain) {
      return null;
    }

    // Create public client with default RPC
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Cache the client
    this.publicClients.set(network, publicClient);
    return publicClient;
  }

  /**
   * Dynamically fetch decimals from ERC20 contract on-chain
   *
   * @param network - The network identifier
   * @param tokenAddress - The token contract address
   * @returns The number of decimals for the token
   */
  private async getAssetDecimals(network: Network, tokenAddress: string): Promise<number> {
    // Check cache first
    const cacheKey = `${network}:${tokenAddress.toLowerCase()}`;
    if (this.decimalsCache.has(cacheKey)) {
      return this.decimalsCache.get(cacheKey)!;
    }

    // Try to fetch from chain
    const publicClient = this.getPublicClient(network);
    if (publicClient) {
      try {
        const decimals = await publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "decimals",
        });

        const decimalsNumber = Number(decimals);
        // Cache the result
        this.decimalsCache.set(cacheKey, decimalsNumber);
        return decimalsNumber;
      } catch (error) {
        // If RPC call fails, fall back to static config
        console.warn(
          `Failed to fetch decimals from chain for ${network}:${tokenAddress}, using fallback`,
          error,
        );
      }
    }

    // Fallback to static configuration
    const staticDecimals = this.getStaticDecimals(network);
    if (staticDecimals !== null) {
      // Cache the fallback value
      this.decimalsCache.set(cacheKey, staticDecimals);
      return staticDecimals;
    }

    // Last resort: default to 18 (most common for ERC20 tokens)
    console.warn(`No decimals found for ${network}:${tokenAddress}, defaulting to 18`);
    return 18;
  }

  /**
   * Get static decimals fallback for known networks
   *
   * @param network - The network identifier
   * @returns The static decimals value or null if unknown
   */
  private getStaticDecimals(network: Network): number | null {
    const staticDecimalsMap: Record<string, number> = {
      "eip155:8453": 6, // Base mainnet USDC
      "eip155:84532": 6, // Base Sepolia USDC
      "eip155:1": 6, // Ethereum mainnet USDC
      "eip155:11155111": 6, // Sepolia USDC
      // Other EVM chains (like BSC) will be fetched dynamically from the blockchain
    };
    return staticDecimalsMap[network] ?? null;
  }

  /**
   * Get the default asset info for a network (typically USDC)
   * Dynamically fetches decimals from the blockchain
   *
   * @param network - The network to get asset info for
   * @returns The asset information including address, name, version, and decimals
   */
  private async getDefaultAsset(network: Network): Promise<{
    address: string;
    name: string;
    version: string;
    decimals: number;
  }> {
    const assetInfo = this.getStaticAssetInfo(network);

    // Dynamically fetch decimals from chain
    const decimals = await this.getAssetDecimals(network, assetInfo.address);

    return {
      ...assetInfo,
      decimals, // Fetched from blockchain
    };
  }

  /**
   * Get asset info for a given symbol on a network
   *
   * @param symbol - The asset symbol
   * @param network - The network to use
   * @returns The asset information including address, name, and version
   */
  private async getAssetInfo(
    symbol: string,
    network: Network,
  ): Promise<{ address: string; name: string; version: string; decimals: number }> {
    const upperSymbol = symbol.toUpperCase();

    // For now, only support USDC
    if (upperSymbol === "USDC" || upperSymbol === "USD") {
      return await this.getDefaultAsset(network);
    }

    // Could extend to support other tokens
    throw new Error(`Unsupported asset: ${symbol} on network ${network}`);
  }
}
