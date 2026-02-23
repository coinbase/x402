/**
 * XRP Network Utilities
 *
 * Helpers for working with XRP network identifiers and server URLs
 */

import { Network } from "@x402/core/types";

/**
 * Known XRP network identifiers in CAIP-2 format
 */
export const XRP_NETWORKS = {
  MAINNET: "xrp:mainnet",
  TESTNET: "xrp:testnet",
  DEVNET: "xrp:devnet",
} as const;

/**
 * Default XRPL server URLs for each network
 */
export const XRP_SERVER_URLS = {
  [XRP_NETWORKS.MAINNET]: "wss://s1.ripple.com",
  [XRP_NETWORKS.TESTNET]: "wss://testnet.xrpl-labs.com",
  [XRP_NETWORKS.DEVNET]: "wss://s.devnet.rippletest.net:51233",
} as const;

/**
 * Validate if a network identifier is a valid XRP network
 *
 * @param network - The network identifier to validate
 * @returns True if it's a valid XRP network
 */
export function validateXrpNetwork(network: Network | string): boolean {
  if (typeof network !== "string") return false;

  // Must start with xrp:
  if (!network.startsWith("xrp:")) return false;

  // Extract the network name
  const parts = network.split(":");
  if (parts.length !== 2) return false;

  const [, networkName] = parts;

  // Known networks
  const knownNetworks = ["mainnet", "testnet", "devnet"];
  if (knownNetworks.includes(networkName)) return true;

  // Allow other networks in xrp: format (for future/custom networks)
  // But validate it's alphanumeric with optional dashes
  return /^[a-zA-Z0-9-]+$/.test(networkName);
}

/**
 * Get the server URL for a given XRP network
 *
 * @param network - The XRP network identifier
 * @returns The WebSocket URL for the network
 * @throws Error if network is not recognized
 */
export function getNetworkUrl(network: Network | string): string {
  if (!validateXrpNetwork(network)) {
    throw new Error(`Invalid XRP network: ${network}`);
  }

  const url = XRP_SERVER_URLS[network as keyof typeof XRP_SERVER_URLS];
  if (url) return url;

  // For unknown xrp: networks, throw - they must provide serverUrl
  throw new Error(`Unknown XRP network: ${network}. Please provide a serverUrl.`);
}

/**
 * Get the network name from a CAIP-2 identifier
 *
 * @param network - The network identifier (e.g., "xrp:testnet")
 * @returns The network name (e.g., "testnet")
 */
export function getNetworkName(network: string): string {
  if (!validateXrpNetwork(network)) {
    throw new Error(`Invalid XRP network: ${network}`);
  }
  return network.split(":")[1];
}

/**
 * Check if a network is a known public network (mainnet/testnet/devnet)
 *
 * @param network - The network identifier
 * @returns True if it's a known public network
 */
export function isPublicNetwork(network: string): boolean {
  return Object.values(XRP_NETWORKS).includes(network as typeof XRP_NETWORKS[keyof typeof XRP_NETWORKS]);
}

/**
 * Get the base reserve (minimum balance) for an account on a given network
 *
 * @param network - The network identifier
 * @returns The base reserve in drops
 */
export function getBaseReserveDrops(network: string): bigint {
  switch (network) {
    case XRP_NETWORKS.MAINNET:
      return 10000000n; // 10 XRP
    case XRP_NETWORKS.TESTNET:
    case XRP_NETWORKS.DEVNET:
      return 1000000n; // 1 XRP
    default:
      return 1000000n; // Default to 1 XRP unknown networks
  }
}
