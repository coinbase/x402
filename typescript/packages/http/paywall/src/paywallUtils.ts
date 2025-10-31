import type { PaymentRequirements } from "x402/types";

// Define supported networks inline to avoid circular dependencies
const EVM_NETWORKS = [
  "base",
  "base-sepolia",
  "abstract",
  "abstract-testnet",
  "avalanche",
  "avalanche-fuji",
  "iotex",
  "sei",
  "sei-testnet",
  "polygon",
  "polygon-amoy",
  "peaq",
];
const SVM_NETWORKS = ["solana", "solana-devnet"];
const EVM_TESTNETS = new Set([
  "base-sepolia",
  "abstract-testnet",
  "avalanche-fuji",
  "sei-testnet",
  "polygon-amoy",
]);
const SVM_TESTNETS = new Set(["solana-devnet"]);

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
 * @returns Ordered list of preferred networks.
 */
export function getPreferredNetworks(testnet: boolean): string[] {
  if (testnet) {
    return ["base-sepolia", "solana-devnet"];
  }
  return ["base", "solana"];
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
 * @param network - The network to check.
 * @returns True if the network is EVM based.
 */
export function isEvmNetwork(network: string): boolean {
  // Check both v1 legacy format and v2 CAIP-2 format (eip155:*)
  return EVM_NETWORKS.includes(network) || network.startsWith("eip155:");
}

/**
 * Determines if the provided network is an SVM network.
 *
 * @param network - The network to check.
 * @returns True if the network is SVM based.
 */
export function isSvmNetwork(network: string): boolean {
  // Check both v1 legacy format and v2 CAIP-2 format (solana:*)
  return SVM_NETWORKS.includes(network) || network.startsWith("solana:");
}

/**
 * Provides a human-readable display name for a network.
 *
 * @param network - The network identifier.
 * @returns A display name suitable for UI use.
 */
export function getNetworkDisplayName(network: string): string {
  // Handle CAIP-2 format
  if (network.startsWith("eip155:")) {
    const chainId = network.split(":")[1];
    if (chainId === "8453") return "Base";
    if (chainId === "84532") return "Base Sepolia";
    return `EVM Chain ${chainId}`;
  }
  if (network.startsWith("solana:")) {
    return network.includes("devnet") ? "Solana Devnet" : "Solana";
  }

  // Handle v1 legacy format
  switch (network) {
    case "base":
      return "Base";
    case "base-sepolia":
      return "Base Sepolia";
    case "solana":
      return "Solana";
    case "solana-devnet":
      return "Solana Devnet";
    default:
      return network;
  }
}

/**
 * Indicates whether the provided network is a testnet.
 *
 * @param network - The network to evaluate.
 * @returns True if the network is a recognized testnet.
 */
export function isTestnetNetwork(network: string): boolean {
  return EVM_TESTNETS.has(network) || SVM_TESTNETS.has(network);
}
