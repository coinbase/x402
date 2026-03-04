/**
 * Format an integer amount as a USD string.
 *
 * @param amount - Amount in smallest unit.
 * @param decimals - Number of decimals (default: 8).
 * @returns USD string.
 */
export function formatAmount(amount: string, decimals: number = 8): string {
  const amountNum = parseInt(amount);
  return (amountNum / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Parse a USD string to an integer string.
 *
 * @param amount - USD amount string or number.
 * @param decimals - Number of decimals (default: 8).
 * @returns Amount in smallest unit.
 */
export function parseAmount(amount: string | number, decimals: number = 8): string {
  const cleaned = typeof amount === "string" ? amount.replace("$", "").trim() : amount;
  const amountNum = typeof cleaned === "string" ? parseFloat(cleaned) : cleaned;

  if (isNaN(amountNum) || amountNum < 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  return Math.floor(amountNum * Math.pow(10, decimals)).toString();
}

/**
 * Validate an Ethereum address.
 *
 * @param address - Address to validate.
 * @returns True if valid.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate a token identifier.
 * Accepts any token in format "SYMBOL:0x..."
 *
 * @param token - Token identifier.
 * @returns True if valid.
 */
export function isValidToken(token: string): boolean {
  return /^[A-Z0-9]+:0x[a-fA-F0-9]{32}$/.test(token);
}

/**
 * Check whether a nonce is within the allowed age.
 *
 * @param nonce - Timestamp nonce.
 * @param maxAge - Max age in ms.
 * @returns True if fresh.
 */
export function isNonceFresh(nonce: number, maxAge: number = 3600000): boolean {
  const now = Date.now();
  const age = now - nonce;
  return age >= 0 && age <= maxAge;
}

/**
 * Normalize an Ethereum address to lowercase.
 *
 * @param address - Address to normalize.
 * @returns Lowercased address.
 */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
