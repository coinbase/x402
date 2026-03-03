import type { UserOperation07Json } from "../../../../erc4337/types";

/**
 * Configuration for bundler client operations
 */
export interface BundlerClientConfig {
  /**
   * Timeout for operations in milliseconds
   *
   * @default 30000
   */
  timeout?: number;

  /**
   * Number of retries for failed operations
   *
   * @default 0
   */
  retries?: number;
}

/**
 * Gas estimation result from bundler
 */
export interface GasEstimate {
  [key: string]: unknown;
  callGasLimit?: string;
  verificationGasLimit?: string;
  preVerificationGas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
}

/**
 * Prepared user operation (unsigned)
 * This matches the format returned by viem's prepareUserOperation,
 * which uses bigint for numeric values.
 */
export interface PreparedUserOperation {
  [key: string]: unknown;
  sender: `0x${string}`;
  nonce: bigint;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: `0x${string}`;
  paymasterData?: `0x${string}`;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  signature?: `0x${string}`;
}

/**
 * Call configuration for preparing user operations
 */
export interface UserOperationCall {
  /**
   * Target contract address
   */
  to: `0x${string}`;

  /**
   * Value to send (in wei, for native ETH transfers)
   */
  value: bigint;

  /**
   * Call data (encoded function call)
   */
  data: `0x${string}`;
}

/**
 * Abstract interface for bundler client operations.
 * This allows different implementations (viem, custom, etc.)
 */
export interface BundlerClient {
  /**
   * Prepares an unsigned user operation for the given calls.
   * This method should estimate gas and populate all required fields.
   *
   * @param calls - Array of calls to execute in the user operation
   * @param entryPoint - The entry point address
   * @returns Promise resolving to a prepared (unsigned) user operation
   */
  prepareUserOperation(
    calls: UserOperationCall[],
    entryPoint: `0x${string}`,
  ): Promise<PreparedUserOperation>;

  /**
   * Estimates gas for a user operation.
   *
   * @param userOp - The user operation to estimate gas for
   * @param entryPoint - The entry point address
   * @returns Promise resolving to gas estimates
   */
  estimateGas(userOp: UserOperation07Json, entryPoint: `0x${string}`): Promise<GasEstimate>;

  /**
   * Sends a user operation to the bundler.
   *
   * @param userOp - The signed user operation to send
   * @param entryPoint - The entry point address
   * @returns Promise resolving to the user operation hash
   */
  sendUserOperation(userOp: UserOperation07Json, entryPoint: `0x${string}`): Promise<string>;
}
