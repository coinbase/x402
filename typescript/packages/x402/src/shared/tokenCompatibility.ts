import { TokenCompatClient, ChainName, CHAIN_NAMES } from "@b3dotfun/anyspend-x402-token-compat";
import { Network } from "../types/shared";

/**
 * Cache for token compatibility results to avoid repeated API calls
 * Key format: `${chainId}:${tokenAddress}`
 */
const compatibilityCache = new Map<
  string,
  {
    supportsEip2612: boolean;
    supportsEip3009: boolean;
    timestamp: number;
  }
>();

// Cache TTL: 1 hour
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Global token compatibility client instance
 */
let tokenCompatClient: TokenCompatClient | null = null;

/**
 * Get or create the token compatibility client
 */
function getTokenCompatClient(): TokenCompatClient {
  if (!tokenCompatClient) {
    tokenCompatClient = new TokenCompatClient({
      apiBaseUrl: process.env.TOKEN_METADATA_API_URL || "https://tokens.anyspend.com",
      timeout: 10000,
    });
  }
  return tokenCompatClient;
}

/**
 * Map x402 network to token-compat chain name
 */
function networkToChainName(network: Network): ChainName | undefined {
  const chainMapping: Record<string, ChainName> = {
    "base": "base",
    "base-sepolia": "base", // Use mainnet metadata for testnet
    "ethereum": "ethereum",
    "ethereum-sepolia": "ethereum",
    "polygon": "polygon",
    "polygon-amoy": "polygon",
    "arbitrum": "arbitrum",
    "arbitrum-sepolia": "arbitrum",
    "optimism": "optimism",
    "optimism-sepolia": "optimism",
    "avalanche": "avalanche",
    "avalanche-fuji": "avalanche",
    "bsc": "bsc",
    "bsc-testnet": "bsc",
    "b3": "b3",
    "b3-sepolia": "b3",
    "abstract": "abstract",
    "abstract-testnet": "abstract",
  };

  return chainMapping[network];
}

/**
 * Check token compatibility with EIP-2612 and EIP-3009
 *
 * Results are cached for 1 hour to avoid repeated API calls
 *
 * @param network - The x402 network identifier
 * @param tokenAddress - The token contract address
 * @returns Token compatibility information
 */
export async function checkTokenCompatibility(
  network: Network,
  tokenAddress: string
): Promise<{
  supportsEip2612: boolean;
  supportsEip3009: boolean;
  error?: string;
}> {
  const chainName = networkToChainName(network);

  if (!chainName) {
    return {
      supportsEip2612: false,
      supportsEip3009: false,
      error: `Unsupported network for token compatibility check: ${network}`,
    };
  }

  const chainId = CHAIN_NAMES[chainName];
  const normalizedAddress = tokenAddress.toLowerCase();
  const cacheKey = `${chainId}:${normalizedAddress}`;

  // Check cache
  const cached = compatibilityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      supportsEip2612: cached.supportsEip2612,
      supportsEip3009: cached.supportsEip3009,
    };
  }

  // Fetch from API
  try {
    const client = getTokenCompatClient();
    const support = await client.getEipSupport(chainName, normalizedAddress);

    // Cache the result
    compatibilityCache.set(cacheKey, {
      supportsEip2612: support.supportsEip2612,
      supportsEip3009: support.supportsEip3009,
      timestamp: Date.now(),
    });

    return support;
  } catch (error) {
    console.error(`Failed to check token compatibility for ${tokenAddress} on ${network}:`, error);

    // Return safe defaults on error (assume no support)
    return {
      supportsEip2612: false,
      supportsEip3009: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Validate if a token supports the required signature type
 *
 * @param network - The x402 network identifier
 * @param tokenAddress - The token contract address
 * @param requiredType - Required signature type (if undefined, checks if token supports ANY gasless method)
 * @returns Validation result
 */
export async function validateTokenCompatibility(
  network: Network,
  tokenAddress: string,
  requiredType?: "authorization" | "permit"
): Promise<{
  isCompatible: boolean;
  reason?: string;
}> {
  const compat = await checkTokenCompatibility(network, tokenAddress);

  if (compat.error) {
    return {
      isCompatible: false,
      reason: compat.error,
    };
  }

  // If no specific type required, check if token supports ANY gasless method
  if (!requiredType) {
    const supportsAny = compat.supportsEip2612 || compat.supportsEip3009;
    return {
      isCompatible: supportsAny,
      reason: supportsAny
        ? undefined
        : "Token does not support EIP-2612 (Permit) or EIP-3009 (TransferWithAuthorization)",
    };
  }

  // Validate specific signature type
  if (requiredType === "authorization") {
    return {
      isCompatible: compat.supportsEip3009,
      reason: compat.supportsEip3009
        ? undefined
        : "Token does not support EIP-3009 (TransferWithAuthorization)",
    };
  }

  if (requiredType === "permit") {
    return {
      isCompatible: compat.supportsEip2612,
      reason: compat.supportsEip2612
        ? undefined
        : "Token does not support EIP-2612 (Permit)",
    };
  }

  return {
    isCompatible: false,
    reason: "Unknown signature type",
  };
}

/**
 * Clear the compatibility cache
 * Useful for testing or force-refresh scenarios
 */
export function clearCompatibilityCache(): void {
  compatibilityCache.clear();
}

/**
 * Get cache statistics
 * Useful for monitoring and debugging
 */
export function getCacheStats(): {
  size: number;
  entries: Array<{ key: string; age: number }>;
} {
  const now = Date.now();
  return {
    size: compatibilityCache.size,
    entries: Array.from(compatibilityCache.entries()).map(([key, value]) => ({
      key,
      age: now - value.timestamp,
    })),
  };
}
