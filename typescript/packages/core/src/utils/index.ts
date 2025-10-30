import { Network } from "../types";

export const findSchemesByNetwork = <T>(
  map: Map<string, Map<string, T>>,
  network: Network,
): Map<string, T> | undefined => {
  // Direct match first
  let implementationsByScheme = map.get(network);

  if (!implementationsByScheme) {
    // Try pattern matching for registered network patterns
    for (const [registeredNetworkPattern, implementations] of map.entries()) {
      // Convert the registered network pattern to a regex
      // e.g., "eip155:*" becomes /^eip155:.*$/
      const pattern = registeredNetworkPattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except *
        .replace(/\\\*/g, ".*"); // Replace escaped * with .*

      const regex = new RegExp(`^${pattern}$`);

      if (regex.test(network)) {
        implementationsByScheme = implementations;
        break;
      }
    }
  }

  return implementationsByScheme;
};

export const findByNetworkAndScheme = <T>(
  map: Map<string, Map<string, T>>,
  scheme: string,
  network: Network,
): T | undefined => {
  return findSchemesByNetwork(map, network)?.get(scheme);
};

export const Base64EncodedRegex = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Encodes a string to base64 format
 *
 * @param data - The string to be encoded to base64
 * @returns The base64 encoded string
 */
export function safeBase64Encode(data: string): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") {
    return globalThis.btoa(data);
  }
  return Buffer.from(data).toString("base64");
}

/**
 * Decodes a base64 string back to its original format
 *
 * @param data - The base64 encoded string to be decoded
 * @returns The decoded string in UTF-8 format
 */
export function safeBase64Decode(data: string): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.atob === "function") {
    return globalThis.atob(data);
  }
  return Buffer.from(data, "base64").toString("utf-8");
}

/**
 * Deep equality comparison for payment requirements
 * Uses a normalized JSON.stringify for consistent comparison
 *
 * @param obj1 - First object to compare
 * @param obj2 - Second object to compare
 * @returns True if objects are deeply equal
 */
export function deepEqual(obj1: unknown, obj2: unknown): boolean {
  // Normalize and stringify both objects for comparison
  // This handles nested objects, arrays, and different property orders
  const normalize = (obj: unknown): string => {
    // Handle primitives and null/undefined
    if (obj === null || obj === undefined) return JSON.stringify(obj);
    if (typeof obj !== "object") return JSON.stringify(obj);

    // Handle arrays
    if (Array.isArray(obj)) {
      return JSON.stringify(
        obj.map(item =>
          typeof item === "object" && item !== null ? JSON.parse(normalize(item)) : item,
        ),
      );
    }

    // Handle objects - sort keys and recursively normalize values
    const sorted: Record<string, unknown> = {};
    Object.keys(obj as Record<string, unknown>)
      .sort()
      .forEach(key => {
        const value = (obj as Record<string, unknown>)[key];
        sorted[key] =
          typeof value === "object" && value !== null ? JSON.parse(normalize(value)) : value;
      });
    return JSON.stringify(sorted);
  };

  try {
    return normalize(obj1) === normalize(obj2);
  } catch {
    // Fallback to simple comparison if normalization fails
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  }
}
