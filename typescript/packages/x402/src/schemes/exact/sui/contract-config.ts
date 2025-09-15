/**
 * X402 Payments Contract Configuration
 * Maps package IDs for different Sui networks
 */

export const X402_PAYMENTS_PACKAGE = {
  testnet: "0xb91e93029e6ff5c321731c07bcea75da5e1dba98f3b218c888043bbfb7ab31bb",
  mainnet: "0xe4ee6413abcbcaf7a7dfdc2beecc38d44008bfe0d3b294ea3d2a6c2f863256d6",
} as const;

export type NetworkName = keyof typeof X402_PAYMENTS_PACKAGE;

/**
 * Gets the package ID for the x402 payments contract on the specified network.
 *
 * @param network - The network name (e.g., 'testnet', 'mainnet', 'sui-testnet', 'sui-mainnet')
 * @returns The package ID for the specified network
 * @throws Error if the network is not recognized
 */
export function getPackageId(network: NetworkName | string): string {
  const networkLower = network.toLowerCase();
  if (networkLower === "testnet" || networkLower === "sui-testnet") {
    return X402_PAYMENTS_PACKAGE.testnet;
  } else if (
    networkLower === "mainnet" ||
    networkLower === "sui" ||
    networkLower === "sui-mainnet"
  ) {
    return X402_PAYMENTS_PACKAGE.mainnet;
  }
  throw new Error(`Unknown network: ${network}`);
}
