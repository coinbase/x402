import { SchemeContext } from ".";

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
 * Extra payload to be considered in the payment header creation, scheme dependent interpretation and validation.
 */
export type ExtraPayload = Record<string, unknown>;

/**
 * Configuration options for X402 client and facilitator operations.
 */
export interface X402Config {
  /** Configuration for Solana (SVM) operations */
  svmConfig?: SvmConfig;
  // Future: evmConfig?: EvmConfig for EVM-specific configurations
  /** Extra payload for header creation. */
  extraPayload?: ExtraPayload;
  /** Scheme specific context. */
  schemeContext?: SchemeContext;
}
