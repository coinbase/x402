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
export function formatUSDC(atomicAmount: string | bigint): string {
  try {
    const rawString =
      typeof atomicAmount === "bigint" ? atomicAmount.toString() : String(atomicAmount).trim();
    if (!rawString) return "0.00";

    // If safely representable as Number, use toLocaleString for consistent formatting
    // Max safe integer is ~9e15, our amounts are expected to be small (a few thousand USD => <= 2e9 atomic)
    if (/^-?\d+$/.test(rawString)) {
      const asInt = Number(rawString);
      if (Number.isSafeInteger(asInt)) {
        const amount = asInt / 1e6;
        return amount.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        });
      }
    }

    // Fallback: BigInt-safe manual formatting for very large inputs
    let s = rawString;
    let negative = false;
    if (s.startsWith("-")) {
      negative = true;
      s = s.slice(1);
    }
    if (!/^\d+$/.test(s)) return "0.00";

    s = s.replace(/^0+/, "");
    if (s === "") s = "0";

    const hasFraction = s.length > 6;
    const integerPart = hasFraction ? s.slice(0, -6) : "0";
    const fracPart = hasFraction ? s.slice(-6) : s.padStart(6, "0");

    const trimmed = fracPart.replace(/0+$/, "");
    const targetLen = Math.min(4, Math.max(2, trimmed.length));
    const displayFrac = fracPart.slice(0, targetLen);

    const withCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${negative ? "-" : ""}${withCommas}.${displayFrac}`;
  } catch {
    return "0.00";
  }
}

/**
 * Parses a USDC amount in human-readable form to atomic units (6 decimals).
 * Accepts up to 6 decimal places; returns null for invalid input.
 *
 * @param input - The human-readable USDC amount (e.g., "1", "1.23", "0.001")
 * @returns {string | null} The atomic units as a string, or null if invalid
 */
export function parseUSDC(input: string): string | null {
  const sanitized = input.replace(/,/g, "").trim();
  if (sanitized === "") return null;
  if (!/^\d*(\.\d{0,6})?$/.test(sanitized)) return null;
  const [whole, fracRaw] = sanitized.split(".");
  const frac = (fracRaw || "").padEnd(6, "0").slice(0, 6);
  try {
    const wholePart = BigInt(whole || "0") * 1000000n;
    const fracPart = BigInt(frac || "0");
    return (wholePart + fracPart).toString();
  } catch {
    return null;
  }
}
