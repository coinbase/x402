/**
 * @file Utility functions for working with payment amounts in the x402 protocol.
 *
 * These utilities help with common conversions between different amount formats
 * used in x402 payment requirements and processing.
 */

/**
 * Convert a dollar string (e.g., "$0.01", "$1.50") to atomic units (wei/lamports).
 *
 * @param dollarString - Dollar amount as string (e.g., "$0.01")
 * @param tokenDecimals - Number of decimals for the token (e.g., 6 for USDC, 18 for ETH)
 * @returns Amount in atomic units as string
 *
 * @example
 * ```typescript
 * // Convert $0.01 to USDC (6 decimals)
 * const usdcAmount = dollarStringToAtomic("$0.01", 6);
 * console.log(usdcAmount); // "10000"
 *
 * // Convert $1.50 to USDC
 * const amount = dollarStringToAtomic("$1.50", 6);
 * console.log(amount); // "1500000"
 * ```
 */
export function dollarStringToAtomic(dollarString: string, tokenDecimals: number): string {
  // Remove the $ sign and validate format
  const cleanAmount = dollarString.replace(/^\$/, "");
  const dollarValue = parseFloat(cleanAmount);

  if (isNaN(dollarValue) || dollarValue < 0) {
    throw new Error(`Invalid dollar amount: ${dollarString}`);
  }

  if (tokenDecimals < 0 || tokenDecimals > 255) {
    throw new Error(`Invalid token decimals: ${tokenDecimals}. Must be between 0 and 255.`);
  }

  // Convert to atomic units by multiplying by 10^decimals
  const atomicValue = Math.round(dollarValue * Math.pow(10, tokenDecimals));

  return atomicValue.toString();
}

/**
 * Convert atomic units back to a dollar string format.
 *
 * @param atomicAmount - Amount in atomic units as string
 * @param tokenDecimals - Number of decimals for the token
 * @returns Dollar amount as string with $ prefix
 *
 * @example
 * ```typescript
 * // Convert 10000 USDC atomic units to dollar string
 * const dollarString = atomicToDollarString("10000", 6);
 * console.log(dollarString); // "$0.01"
 *
 * // Convert 1500000 USDC atomic units
 * const amount = atomicToDollarString("1500000", 6);
 * console.log(amount); // "$1.50"
 * ```
 */
export function atomicToDollarString(atomicAmount: string, tokenDecimals: number): string {
  const atomicValue = BigInt(atomicAmount);

  if (atomicValue < 0n) {
    throw new Error(`Invalid atomic amount: ${atomicAmount}. Must be non-negative.`);
  }

  if (tokenDecimals < 0 || tokenDecimals > 255) {
    throw new Error(`Invalid token decimals: ${tokenDecimals}. Must be between 0 and 255.`);
  }

  // Convert from atomic units by dividing by 10^decimals
  const divisor = BigInt(Math.pow(10, tokenDecimals));
  const wholePart = atomicValue / divisor;
  const fractionalPart = atomicValue % divisor;

  // Format fractional part with leading zeros
  const fractionalString = fractionalPart.toString().padStart(tokenDecimals, "0");

  // Remove trailing zeros from fractional part
  const trimmedFractional = fractionalString.replace(/0+$/, "");

  // Construct the final dollar string
  if (trimmedFractional === "") {
    return `$${wholePart.toString()}`;
  } else {
    return `$${wholePart.toString()}.${trimmedFractional}`;
  }
}

/**
 * Validate that an amount string represents a valid positive integer.
 * Used for validating atomic amounts in payment requirements.
 *
 * @param amount - Amount string to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidAtomicAmount("10000"); // true
 * isValidAtomicAmount("0"); // true
 * isValidAtomicAmount("-100"); // false
 * isValidAtomicAmount("1.5"); // false
 * isValidAtomicAmount("abc"); // false
 * ```
 */
export function isValidAtomicAmount(amount: string): boolean {
  try {
    const parsed = BigInt(amount);
    return parsed >= 0n && parsed.toString() === amount;
  } catch {
    return false;
  }
}

/**
 * Compare two atomic amounts.
 *
 * @param a - First amount as string
 * @param b - Second amount as string
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 *
 * @example
 * ```typescript
 * compareAtomicAmounts("10000", "20000"); // -1
 * compareAtomicAmounts("10000", "10000"); // 0
 * compareAtomicAmounts("20000", "10000"); // 1
 * ```
 */
export function compareAtomicAmounts(a: string, b: string): number {
  const aBig = BigInt(a);
  const bBig = BigInt(b);

  if (aBig < bBig) return -1;
  if (aBig > bBig) return 1;
  return 0;
}

/**
 * Common token decimals for well-known tokens.
 * These can be used as reference values in applications.
 */
export const TOKEN_DECIMALS = {
  /** Ethereum (ETH) */
  ETH: 18,
  /** USD Coin (USDC) */
  USDC: 6,
  /** Tether (USDT) */
  USDT: 6,
  /** Dai Stablecoin (DAI) */
  DAI: 18,
  /** Wrapped Bitcoin (WBTC) */
  WBTC: 8,
  /** Solana (SOL) */
  SOL: 9,
} as const;
