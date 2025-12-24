/**
 * Aptos x402 payment contract addresses and utilities
 *
 * This module manages the deployed x402 payment contract addresses
 * for different Aptos networks.
 */

import { Network } from "../../types/shared/network";

/**
 * x402 payment contract package addresses for each Aptos network
 *
 * These contracts handle payment verification with invoice tracking.
 *
 * TODO: Update these addresses once contracts are deployed
 */
export const APTOS_X402_PACKAGE_IDS: Record<string, string> = {
  "aptos-mainnet": "0x0000000000000000000000000000000000000000000000000000000000000000", // TODO: Deploy contract
  "aptos-testnet": "0x0000000000000000000000000000000000000000000000000000000000000000", // TODO: Deploy contract
};

/**
 * Gets the x402 payment contract package ID for a given network
 *
 * @param network - The Aptos network identifier
 * @returns The contract package address for the specified network
 * @throws Error if the network is not supported or contract is not deployed
 */
export function getX402PackageId(network: Network): string {
  const packageId = APTOS_X402_PACKAGE_IDS[network];

  if (!packageId) {
    throw new Error(`Unsupported Aptos network for x402 payments: ${network}`);
  }

  if (packageId === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    throw new Error(
      `x402 payment contract not yet deployed on ${network}. ` +
        "Please deploy the contract or use a network with an existing deployment.",
    );
  }

  return packageId;
}

/**
 * Gets the full module identifier for the x402 payment function
 *
 * @param network - The Aptos network identifier
 * @returns The full module::function identifier for making x402 payments
 */
export function getX402PaymentFunction(network: Network): `${string}::${string}::${string}` {
  const packageId = getX402PackageId(network);
  return `${packageId}::payments::make_payment` as `${string}::${string}::${string}`;
}

/**
 * Configuration for x402 payment contract
 */
export interface X402ContractConfig {
  /** The package/module address of the x402 payment contract */
  packageId: string;
  /** The full function identifier for making payments */
  paymentFunction: string;
  /** Contract version */
  version: number;
}

/**
 * Gets the complete contract configuration for a network
 *
 * @param network - The Aptos network identifier
 * @returns The x402 contract configuration
 */
export function getX402ContractConfig(network: Network): X402ContractConfig {
  const packageId = getX402PackageId(network);
  return {
    packageId,
    paymentFunction: `${packageId}::payments::make_payment`,
    version: 1,
  };
}
