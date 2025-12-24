/**
 * Configuration options for Solana (SVM) RPC connections.
 */
export interface SvmConfig {
  /**
   * Custom RPC URL for Solana connections.
   * If not provided, defaults to public Solana RPC endpoints based on network.
   */
  rpcUrl?: string;
}

/**
 * Configuration options for Aptos RPC connections.
 */
export interface AptosConfig {
  /**
   * Custom RPC URL for Aptos connections.
   * If not provided, defaults to public Aptos RPC endpoints based on network.
   */
  rpcUrl?: string;
}

/**
 * Configuration options for X402 client and facilitator operations.
 */
export interface X402Config {
  /** Configuration for Solana (SVM) operations */
  svmConfig?: SvmConfig;
  /** Configuration for Aptos operations */
  aptosConfig?: AptosConfig;
  // Future: evmConfig?: EvmConfig for EVM-specific configurations
}
