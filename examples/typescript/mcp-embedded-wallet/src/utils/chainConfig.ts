export interface ChainConfig {
  id: number;
  name: string;
  blockExplorerUrl: string;
  nativeCurrency: {
    symbol: string;
    decimals: number;
  };
  tokens: {
    USDC?: {
      address: string;
      decimals: number;
    };
    ETH?: {
      address: string;
      decimals: number;
    };
  };
}

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  base: {
    id: 8453,
    name: "Base",
    blockExplorerUrl: "https://basescan.org/tx/",
    nativeCurrency: {
      symbol: "ETH",
      decimals: 18,
    },
    tokens: {
      USDC: {
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
      },
    },
  },
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    blockExplorerUrl: "https://sepolia.basescan.org/tx/",
    nativeCurrency: {
      symbol: "ETH",
      decimals: 18,
    },
    tokens: {
      USDC: {
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        decimals: 6,
      },
    },
  },
};

/**
 * Generates a block explorer URL for a transaction on a specific network.
 * Falls back to Base network if the specified network is not found.
 *
 * @param network - The network identifier (e.g., "base" or "base-sepolia")
 * @param txHash - The transaction hash to generate URL for
 * @returns {string} The complete block explorer URL for the transaction
 */
export function getBlockExplorerUrl(network: string, txHash: string): string {
  const chainConfig = CHAIN_CONFIGS[network] || CHAIN_CONFIGS["base"]; // Default to base
  return `${chainConfig.blockExplorerUrl}${txHash}`;
}

/**
 * Gets the decimal places for a token on a specific network.
 * Matches token address case-insensitively against known tokens.
 * Falls back to USDC decimals (6) if network or token not found.
 *
 * @param network - The network identifier (e.g., "base" or "base-sepolia")
 * @param tokenAddress - The token contract address to look up
 * @returns {number} The number of decimal places for the token
 */
export function getTokenDecimals(network: string, tokenAddress: string): number {
  const chainConfig = CHAIN_CONFIGS[network];
  if (!chainConfig) return 6; // Default to USDC decimals

  // Check if it matches known token addresses
  for (const tokenInfo of Object.values(chainConfig.tokens)) {
    if (tokenInfo && tokenInfo.address.toLowerCase() === tokenAddress.toLowerCase()) {
      return tokenInfo.decimals;
    }
  }

  // Default to USDC decimals if not found
  return chainConfig.tokens.USDC?.decimals || 6;
}

/**
 * Formats a USDC amount from atomic units to human-readable format.
 * Converts from base units (6 decimals) and formats with appropriate decimal places.
 * Shows 2-4 decimal places, with minimum 2 decimals for consistent display.
 *
 * @param atomicAmount - The amount in USDC atomic units (6 decimal places)
 * @returns {string} The formatted amount with appropriate decimal places
 */
export function formatUSDCAmount(atomicAmount: string): string {
  const amount = parseInt(atomicAmount) / Math.pow(10, 6);

  // Show at least 2 decimal places, up to 4 (since 0.001 is the minimum x402 amount)
  // Remove trailing zeros beyond 2 decimal places
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
