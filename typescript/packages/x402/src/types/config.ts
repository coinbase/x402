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
 * Configuration options for Stellar RPC connections.
 */
export interface StellarConfig {
  /**
   * Custom RPC URL for Stellar/Soroban connections.
   * Must be provided for mainnet.
   * For a list of RPC providers, see https://developers.stellar.org/docs/data/apis/rpc/providers#publicly-accessible-apis
   */
  rpcUrl?: string;
}

/**
 * Configuration options for X402 client and facilitator operations.
 */
export interface X402Config {
  /** Configuration for Solana (SVM) operations */
  svmConfig?: SvmConfig;
  /** Configuration for Stellar operations */
  stellarConfig?: StellarConfig;
  // Future: evmConfig?: EvmConfig for EVM-specific configurations
}
