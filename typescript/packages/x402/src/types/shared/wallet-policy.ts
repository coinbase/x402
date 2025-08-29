import { Money, Price } from "./";

/**
 * Asset-specific policy configuration
 */
export interface AssetPolicy {
  /** Maximum amount allowed for this asset, can be Money (e.g., "$0.10") or ERC20TokenAmount */
  limit?: Price;
}

/**
 * Network-specific policy configuration
 * Can be either an asset mapping or a configuration for native currency
 */
export type NetworkPolicy = {
  /** Mapping of asset addresses to their policies */
  [assetAddress: string]: AssetPolicy;
} | {
  /** Policy for the network's native currency (e.g., ETH, MATIC) */
  native?: AssetPolicy;
};

/**
 * Payment policy configuration
 */
export interface PaymentPolicy {
  /** 
   * Network configurations
   * Key: network name (e.g., "base", "ethereum")
   * Value: NetworkPolicy or Money shorthand (e.g., "$0.10" for USDC)
   */
  networks: {
    [network: string]: NetworkPolicy | Money;
  };
  
  /** Maximum total spending limit across all networks/assets */
  maxTotalSpend?: Money;
  
  /** Whether to require user confirmation for payments */
  requireConfirmation?: boolean;
}

/**
 * Comprehensive wallet policy configuration
 */
export interface WalletPolicy {
  /** Payment-related policies */
  payments?: PaymentPolicy;
  
  // Future extensibility for other policy types:
  // subscriptions?: SubscriptionPolicy;
  // permissions?: PermissionPolicy;
  // gasPreferences?: GasPolicy;
}

/**
 * USDC addresses for shorthand expansion
 */
export const USDC_ADDRESSES = {
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "ethereum": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "polygon": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  "arbitrum": "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
  "optimism": "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
  "avalanche": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  "bsc": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
} as const;