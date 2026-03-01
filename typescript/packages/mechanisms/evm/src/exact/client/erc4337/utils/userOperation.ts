import type { Hex } from "viem";
import type { UserOperation07Json } from "../../../../erc4337/types";

/**
 * Converts a bigint value to a hex string in JSON-RPC format.
 *
 * @param value - The bigint value to convert
 * @returns The hex string representation
 */
function toRpcHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

/**
 * Converts a user operation with bigint values to JSON-RPC compatible format.
 * This recursively converts all bigint values to hex strings.
 *
 * @param userOp - The user operation object (may contain bigints)
 * @returns The user operation in JSON-RPC format (all bigints converted to hex)
 */
export function userOpToJson(userOp: Record<string, unknown>): UserOperation07Json {
  const json: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(userOp)) {
    // Skip internal viem fields that bundlers reject
    if (key === "account") continue;

    if (typeof value === "bigint") {
      json[key] = toRpcHex(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      // Recursively handle nested objects with bigints
      const inner: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        inner[k] = typeof v === "bigint" ? toRpcHex(v) : v;
      }
      json[key] = inner;
    } else {
      json[key] = value;
    }
  }

  return json as UserOperation07Json;
}
