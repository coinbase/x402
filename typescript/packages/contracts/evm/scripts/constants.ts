/**
 * Internal constants for deployment scripts
 * These are not exported in the public npm package.
 */

// Re-export public constants
export { PERMIT2_ADDRESS, X402_PERMIT2_PROXY_ADDRESS } from "../src/constants";

/**
 * Deterministic Deployment Proxy (Arachnid's CREATE2 deployer)
 * This contract exists at the same address on all EVM chains.
 * @see https://github.com/Arachnid/deterministic-deployment-proxy
 */
export const DETERMINISTIC_DEPLOYER =
  "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;

/**
 * Salt used for CREATE2 deployment of x402Permit2Proxy
 * This ensures the same address on all chains.
 * Derived from: "x402-x402permit2proxy-v95348"
 * Produces address: 0x40203F636c4EDFaFc36933837FFB411e1c031B50
 */
export const X402_PROXY_DEPLOYMENT_SALT =
  "0x09e25b37e9a072e0b66f88adecada79b0d9276bc1efadd9b55e15c26c76be929" as const;

/**
 * Chain ID to network name mapping
 */
export const CHAIN_ID_TO_NAME: Record<string, string> = {
  // Mainnets
  "1": "mainnet",
  "8453": "base",
  "10": "optimism",
  "42161": "arbitrum",
  "137": "polygon",
  "43114": "avalanche",
  // Testnets
  "11155111": "sepolia",
  "84532": "base-sepolia",
  "11155420": "optimism-sepolia",
  "421614": "arbitrum-sepolia",
  "80001": "polygon-mumbai",
  "43113": "fuji",
  // Local
  "1337": "hardhat",
  "31337": "localhost",
} as const;

/**
 * Block explorer URLs for contract verification links
 */
export const EXPLORER_URLS: Record<string, string> = {
  mainnet: "https://etherscan.io",
  base: "https://basescan.org",
  optimism: "https://optimistic.etherscan.io",
  arbitrum: "https://arbiscan.io",
  polygon: "https://polygonscan.com",
  sepolia: "https://sepolia.etherscan.io",
  "base-sepolia": "https://sepolia.basescan.org",
  "optimism-sepolia": "https://sepolia-optimism.etherscan.io",
  "arbitrum-sepolia": "https://sepolia.arbiscan.io",
} as const;
