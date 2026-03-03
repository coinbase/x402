/**
 * Gas estimation response from bundler
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
 * User operation receipt from bundler
 */
export interface UserOperationReceipt {
  [key: string]: unknown;
  userOpHash: string;
  entryPoint: string;
  sender: string;
  nonce: string;
  paymaster?: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  reason?: string;
  logs: unknown[];
  receipt?: {
    [key: string]: unknown;
    transactionHash: string;
  };
  transactionHash?: string;
}

/**
 * Configuration for bundler client
 */
export interface BundlerClientConfig {
  /**
   * Timeout for RPC calls in milliseconds
   *
   * @default 10000
   */
  timeout?: number;
  /**
   * Number of retries for failed requests
   *
   * @default 0
   */
  retries?: number;
}

/**
 * JSON-RPC error response
 */
export interface JsonRpcError {
  message?: string;
  code?: number;
  data?: unknown;
}

/**
 * JSON-RPC response wrapper
 */
export interface JsonRpcResponse<T> {
  result?: T;
  error?: JsonRpcError;
}

/**
 * Custom error class for bundler-related errors
 */
export class BundlerError extends Error {
  readonly code?: number;
  readonly data?: unknown;
  readonly method?: string;
  readonly bundlerUrl?: string;

  /**
   * Creates a new BundlerError instance.
   *
   * @param message - The error message
   * @param options - Error context options
   * @param options.code - The JSON-RPC error code, if any
   * @param options.data - Additional error data from the bundler
   * @param options.method - The RPC method that failed
   * @param options.bundlerUrl - The bundler URL that was called
   * @param options.cause - The underlying cause error
   */
  constructor(
    message: string,
    options?: {
      code?: number;
      data?: unknown;
      method?: string;
      bundlerUrl?: string;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = "BundlerError";
    this.code = options?.code;
    this.data = options?.data;
    this.method = options?.method;
    this.bundlerUrl = options?.bundlerUrl;
    if (options?.cause) {
      // @ts-expect-error - cause is a standard Error property but not in all TypeScript versions
      this.cause = options.cause;
    }
  }
}
