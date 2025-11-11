import type { PaymentRequirements } from "x402/types";

// Chain configuration constants

// EVM Chain IDs (CAIP-2 format: eip155:chainId)
export const EVM_CHAIN_IDS = {
  BASE_MAINNET: "8453",
  BASE_SEPOLIA: "84532",
  AVALANCHE_MAINNET: "43114",
  AVALANCHE_FUJI: "43113",
  POLYGON_MAINNET: "137",
  POLYGON_AMOY: "80002",
  ABSTRACT_TESTNET: "11124",
  SEI_TESTNET: "1328",
} as const;

export const EVM_TESTNET_CHAIN_IDS: Set<string> = new Set([
  EVM_CHAIN_IDS.BASE_SEPOLIA,
  EVM_CHAIN_IDS.ABSTRACT_TESTNET,
  EVM_CHAIN_IDS.AVALANCHE_FUJI,
  EVM_CHAIN_IDS.SEI_TESTNET,
  EVM_CHAIN_IDS.POLYGON_AMOY,
]);

// Solana Network References (CAIP-2 format: solana:genesisHash)
export const SOLANA_NETWORK_REFS = {
  MAINNET: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  DEVNET: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
} as const;

/**
 * Normalizes the payment requirements into an array.
 *
 * @param paymentRequirements - A single requirement or a list of requirements.
 * @returns An array of payment requirements.
 */
export function normalizePaymentRequirements(
  paymentRequirements: PaymentRequirements | PaymentRequirements[],
): PaymentRequirements[] {
  if (Array.isArray(paymentRequirements)) {
    return paymentRequirements;
  }
  return [paymentRequirements];
}

/**
 * Returns the preferred networks to attempt first when selecting a payment requirement.
 *
 * @param testnet - Whether the paywall is operating in testnet mode.
 * @returns Ordered list of preferred networks (CAIP-2 format).
 */
export function getPreferredNetworks(testnet: boolean): string[] {
  if (testnet) {
    return [`eip155:${EVM_CHAIN_IDS.BASE_SEPOLIA}`, `solana:${SOLANA_NETWORK_REFS.DEVNET}`];
  }
  return [`eip155:${EVM_CHAIN_IDS.BASE_MAINNET}`, `solana:${SOLANA_NETWORK_REFS.MAINNET}`];
}

/**
 * Selects the most appropriate payment requirement for the user.
 *
 * @param paymentRequirements - All available payment requirements.
 * @param testnet - Whether the paywall is operating in testnet mode.
 * @returns The selected payment requirement.
 */
export function choosePaymentRequirement(
  paymentRequirements: PaymentRequirements | PaymentRequirements[],
  testnet: boolean,
): PaymentRequirements {
  const normalized = normalizePaymentRequirements(paymentRequirements);
  const preferredNetworks = getPreferredNetworks(testnet);

  // Try to find a requirement matching preferred networks
  for (const preferredNetwork of preferredNetworks) {
    const match = normalized.find(req => req.network === preferredNetwork);
    if (match) {
      return match;
    }
  }

  // Fall back to first requirement
  return normalized[0];
}

/**
 * Determines if the provided network is an EVM network.
 *
 * @param network - The network to check (CAIP-2 format: eip155:chainId).
 * @returns True if the network is EVM based.
 */
export function isEvmNetwork(network: string): boolean {
  return network.startsWith("eip155:");
}

/**
 * Determines if the provided network is an SVM network.
 *
 * @param network - The network to check (CAIP-2 format: solana:reference).
 * @returns True if the network is SVM based.
 */
export function isSvmNetwork(network: string): boolean {
  return network.startsWith("solana:");
}

/**
 * Provides a human-readable display name for a network.
 *
 * @param network - The network identifier (CAIP-2 format).
 * @returns A display name suitable for UI use.
 */
export function getNetworkDisplayName(network: string): string {
  if (network.startsWith("eip155:")) {
    const chainId = network.split(":")[1];
    if (chainId === EVM_CHAIN_IDS.BASE_MAINNET) return "Base";
    if (chainId === EVM_CHAIN_IDS.BASE_SEPOLIA) return "Base Sepolia";
    if (chainId === EVM_CHAIN_IDS.AVALANCHE_MAINNET) return "Avalanche";
    if (chainId === EVM_CHAIN_IDS.AVALANCHE_FUJI) return "Avalanche Fuji";
    if (chainId === EVM_CHAIN_IDS.POLYGON_MAINNET) return "Polygon";
    if (chainId === EVM_CHAIN_IDS.POLYGON_AMOY) return "Polygon Amoy";
    return `EVM Chain ${chainId}`;
  }

  if (network.startsWith("solana:")) {
    const ref = network.split(":")[1];
    return ref === SOLANA_NETWORK_REFS.DEVNET ? "Solana Devnet" : "Solana";
  }

  return network;
}

/**
 * Indicates whether the provided network is a testnet.
 *
 * @param network - The network to evaluate (CAIP-2 format).
 * @returns True if the network is a recognized testnet.
 */
export function isTestnetNetwork(network: string): boolean {
  if (network.startsWith("eip155:")) {
    const chainId = network.split(":")[1];
    return EVM_TESTNET_CHAIN_IDS.has(chainId);
  }

  if (network.startsWith("solana:")) {
    const ref = network.split(":")[1];
    return ref === SOLANA_NETWORK_REFS.DEVNET;
  }

  return false;
}
