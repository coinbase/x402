import { Network } from "./shared/network";

/**
 * Configuration options for EVM network connections.
 * Supports Base and other EVM-compatible networks.
 */
export interface EvmNetworkConfig {
  /**
   * RPC URL for the EVM network connection.
   * If not provided, defaults to public RPC endpoints based on network.
   */
  rpcUrl?: string;
}

/**
 * Configuration mapping for EVM-compatible networks (e.g., Base, Polygon, Avalanche).
 * Keys must be valid Network types, values contain network-specific configuration.
 */
export type EvmConfig = Partial<Record<Network, EvmNetworkConfig>>;

/**
 * Configuration options for SVM network connections.
 * Supports Solana and other SVM-compatible networks.
 */
export interface SvmNetworkConfig {
  /**
   * RPC URL for the SVM network connection.
   * If not provided, defaults to public RPC endpoints based on network.
   */
  rpcUrl?: string;
}

/**
 * Configuration mapping for SVM-compatible networks (e.g., Solana).
 * Keys must be valid Network types, values contain network-specific configuration.
 */
export type SvmConfig = Partial<Record<Network, SvmNetworkConfig>>;

/**
 * Configuration options for X402 client and facilitator operations.
 */
export interface X402Config {
  /** Configuration for SVM-compatible operations (e.g., Solana) */
  svmConfig?: SvmConfig;
  /** Configuration for EVM-compatible operations (e.g., Base, Polygon, Avalanche) */
  evmConfig?: EvmConfig;
}
