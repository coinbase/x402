import crypto from "crypto";

/**
 * Generate a 64-character hexadecimal voucher ID
 *
 * @returns A new voucher id (0x-prefixed)
 */
export function generateVoucherId(): string {
  // 32 bytes = 64 hex characters
  const bytes = crypto.randomBytes(32);
  return `0x${bytes.toString("hex")}`;
}
