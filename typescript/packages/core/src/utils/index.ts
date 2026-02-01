import { Network } from "../types";

/**
 * Scheme data structure for facilitator storage
 */
export interface SchemeData<T> {
  facilitator: T;
  networks: Set<Network>;
  pattern: Network;
}

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

/**
 * Finds a facilitator by scheme and network using pattern matching.
 * Works with new SchemeData storage structure.
 *
 * @param schemeMap - Map of scheme names to SchemeData
 * @param scheme - The scheme to find
 * @param network - The network to match against
 * @returns The facilitator if found, undefined otherwise
 */
export const findFacilitatorBySchemeAndNetwork = <T>(
  schemeMap: Map<string, SchemeData<T>>,
  scheme: string,
  network: Network,
): T | undefined => {
  const schemeData = schemeMap.get(scheme);
  if (!schemeData) return undefined;

  // Check if network is in the stored networks set
  if (schemeData.networks.has(network)) {
    return schemeData.facilitator;
  }

  // Try pattern matching
  const patternRegex = new RegExp("^" + schemeData.pattern.replace("*", ".*") + "$");
  if (patternRegex.test(network)) {
    return schemeData.facilitator;
  }

  return undefined;
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
    const bytes = new TextEncoder().encode(data);
    const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join("");
    return globalThis.btoa(binaryString);
  }
  return Buffer.from(data, "utf8").toString("base64");
}

/**
 * Decodes a base64 string back to its original format
 *
 * @param data - The base64 encoded string to be decoded
 * @returns The decoded string in UTF-8 format
 */
export function safeBase64Decode(data: string): string {
  if (typeof globalThis !== "undefined" && typeof globalThis.atob === "function") {
    const binaryString = globalThis.atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
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

/**
 * Regular expression for validating CAIP-2 network identifiers.
 * Format: namespace:reference (e.g., "eip155:8453", "solana:mainnet")
 *
 * @see https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md
 */
export const NetworkIdRegex = /^[a-z0-9-]+:[a-zA-Z0-9-]+$/;

/**
 * Validates whether a string is a valid CAIP-2 network identifier.
 *
 * @param network - The network string to validate
 * @returns True if the network string matches CAIP-2 format
 *
 * @example
 * ```typescript
 * isValidNetwork("eip155:8453"); // true (Base mainnet)
 * isValidNetwork("solana:mainnet"); // true
 * isValidNetwork("invalid"); // false
 * isValidNetwork(""); // false
 * ```
 */
export function isValidNetwork(network: string): network is Network {
  if (!network || typeof network !== "string") {
    return false;
  }
  return NetworkIdRegex.test(network);
}

/**
 * Validates whether a payment amount is valid (positive number or numeric string).
 *
 * @param amount - The amount to validate (string or number)
 * @returns True if the amount is a valid positive value
 *
 * @example
 * ```typescript
 * isValidPaymentAmount("1000000"); // true
 * isValidPaymentAmount(1000000); // true
 * isValidPaymentAmount("0"); // false (must be positive)
 * isValidPaymentAmount("-100"); // false (must be positive)
 * isValidPaymentAmount("abc"); // false (not a number)
 * ```
 */
export function isValidPaymentAmount(amount: string | number): boolean {
  if (amount === null || amount === undefined) {
    return false;
  }

  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numericAmount) || !isFinite(numericAmount)) {
    return false;
  }

  return numericAmount > 0;
}

/**
 * Formats a network identifier for human-readable display.
 *
 * @param network - The CAIP-2 network identifier
 * @returns A human-readable network name
 *
 * @example
 * ```typescript
 * formatNetworkDisplay("eip155:8453"); // "Base"
 * formatNetworkDisplay("eip155:84532"); // "Base Sepolia"
 * formatNetworkDisplay("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"); // "Solana"
 * formatNetworkDisplay("eip155:1"); // "Ethereum"
 * formatNetworkDisplay("unknown:123"); // "unknown:123"
 * ```
 */
export function formatNetworkDisplay(network: Network): string {
  const networkNames: Record<string, string> = {
    "eip155:1": "Ethereum",
    "eip155:8453": "Base",
    "eip155:84532": "Base Sepolia",
    "eip155:137": "Polygon",
    "eip155:42161": "Arbitrum",
    "eip155:10": "Optimism",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana",
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "Solana Devnet",
  };

  return networkNames[network] || network;
}

/**
 * Extracts the namespace (chain family) from a CAIP-2 network identifier.
 *
 * @param network - The CAIP-2 network identifier
 * @returns The namespace portion (e.g., "eip155", "solana")
 *
 * @example
 * ```typescript
 * getNetworkNamespace("eip155:8453"); // "eip155"
 * getNetworkNamespace("solana:mainnet"); // "solana"
 * ```
 */
export function getNetworkNamespace(network: Network): string {
  const [namespace] = network.split(":");
  return namespace;
}

/**
 * Extracts the reference (chain ID) from a CAIP-2 network identifier.
 *
 * @param network - The CAIP-2 network identifier
 * @returns The reference portion (e.g., "8453", "mainnet")
 *
 * @example
 * ```typescript
 * getNetworkReference("eip155:8453"); // "8453"
 * getNetworkReference("solana:mainnet"); // "mainnet"
 * ```
 */
export function getNetworkReference(network: Network): string {
  const parts = network.split(":");
  return parts.slice(1).join(":");
}
