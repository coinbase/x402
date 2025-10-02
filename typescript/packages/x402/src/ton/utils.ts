import { Address } from "@ton/core";

export function assertEq<T>(a: T, b: T, reason: string) {
  if (a !== b) throw new Error(reason);
}

export function toAtomic(amount: string, decimals: number): string {
  const [whole, fractional = ""] = amount.split(".");
  const paddedFractional = fractional.padEnd(decimals, "0").slice(0, decimals);
  const result = whole + paddedFractional;
  // Remove leading zeros but keep at least one zero if result is empty
  return result.replace(/^0+/, "") || "0";
}

// Normalize TON address formats (bounceable/non-bounceable, workchain, user-friendly/raw)
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

// Generate explorer URL for transaction viewing
export function getTonExplorerUrl(txid: string, network: string): string {
  const baseUrl =
    network === "ton:testnet" ? "https://testnet.tonviewer.com" : "https://tonviewer.com";

  return `${baseUrl}/transaction/${txid}`;
}

// Validate TON address format and return normalized version
export function isValidTonAddress(address: string): boolean {
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

// Validate memo/invoice ID format and security
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

export function validateMemoLegacy(memo: string): { valid: boolean; reason?: string } {
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
