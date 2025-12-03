import { Address } from "@ton/core";

/**
 * Asserts equality and throws with a reason if values differ.
 *
 * @param a - Actual value.
 * @param b - Expected value.
 * @param reason - Error code/reason used in thrown error.
 */
export function assertEq<T>(a: T, b: T, reason: string) {
  if (a !== b) throw new Error(reason);
}

/**
 * Converts a human-readable amount to atomic units given token decimals.
 *
 * @param amount - Decimal string (e.g. "1.23").
 * @param decimals - Number of decimal places for the asset.
 * @returns Atomic unit string.
 */
export function toAtomic(amount: string, decimals: number): string {
  const [whole, fractional = ""] = amount.split(".");
  const paddedFractional = fractional.padEnd(decimals, "0").slice(0, decimals);
  const result = whole + paddedFractional;
  // Remove leading zeros but keep at least one zero if result is empty
  return result.replace(/^0+/, "") || "0";
}

/**
 * Normalizes TON address to a stable, comparable representation.
 *
 * @param address - Raw, bounceable or user-friendly address.
 * @returns Canonical non-bounceable, urlSafe address string.
 */
export function normalizeTonAddress(address: string): string {
  try {
    const addr = Address.parse(address);
    // Return canonical user-friendly format (bounceable = true, testOnly = false for mainnet)
    return addr.toString({ bounceable: false, urlSafe: true });
  } catch {
    // If parsing fails, return as-is
    return address;
  }
}

/**
 * Generates explorer URL for transaction viewing.
 *
 * @param txid - Transaction hash.
 * @param network - Network name (e.g. "ton:testnet", "ton:mainnet").
 * @returns Explorer URL for the given transaction.
 */
export function getTonExplorerUrl(txid: string, network: string): string {
  const baseUrl =
    network === "ton:testnet" ? "https://testnet.tonviewer.com" : "https://tonviewer.com";

  return `${baseUrl}/transaction/${txid}`;
}

/**
 * Validates TON address format and returns normalized version.
 *
 * @param address - Raw TON address.
 * @returns Normalized address or throws if invalid.
 */
export function isValidTonAddress(address: string): boolean {
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates memo/invoice ID format and security.
 *
 * @param memo - Memo string to validate.
 * @returns Object with validation result and optional reason.
 */
export function validateMemoStrict(memo: string): { valid: boolean; reason?: string } {
  // Length check
  if (memo.length === 0 || memo.length > 128) {
    return { valid: false, reason: "Memo length must be 1-128 characters" };
  }

  // Character validation - only safe characters
  if (!/^[A-Za-z0-9:_-]+$/.test(memo)) {
    return {
      valid: false,
      reason: "Memo contains invalid characters. Only A-Z, a-z, 0-9, :, _, - allowed",
    };
  }

  // Require x402: prefix
  if (!memo.startsWith("x402:")) {
    return { valid: false, reason: "Memo must start with x402:" };
  }

  return { valid: true };
}

/**
 * Validates memo/invoice ID format and security.
 *
 * @param memo - Memo string to validate.
 * @returns Object with validation result and optional reason.
 */
export function validateMemo(memo: string): { valid: boolean; reason?: string } {
  // Length check
  if (memo.length === 0 || memo.length > 128) {
    return { valid: false, reason: "Memo length must be 1-128 characters" };
  }

  // Character validation - only safe characters
  if (!/^[A-Za-z0-9:_-]+$/.test(memo)) {
    return {
      valid: false,
      reason: "Memo contains invalid characters. Only A-Z, a-z, 0-9, :, _, - allowed",
    };
  }

  return { valid: true };
}
