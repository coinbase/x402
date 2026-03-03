import type {
  BundlerClientConfig,
  GasEstimate,
  JsonRpcResponse,
  UserOperationReceipt,
} from "./types";
import { BundlerError } from "./types";

/**
 * Bundler RPC client for ERC-4337 user operations
 */
export class BundlerClient {
  private readonly rpcUrl: string;
  private readonly config: Required<BundlerClientConfig>;

  /**
   * Creates a new BundlerClient instance.
   *
   * @param rpcUrl - The bundler JSON-RPC URL
   * @param config - Optional client configuration
   */
  constructor(rpcUrl: string, config?: BundlerClientConfig) {
    this.rpcUrl = rpcUrl;
    this.config = {
      timeout: config?.timeout ?? 10_000,
      retries: config?.retries ?? 0,
    };
  }

  /**
   * Estimates gas for a user operation
   *
   * @param userOp - The user operation to estimate gas for
   * @param entryPoint - The entry point address
   * @returns The gas estimate
   */
  async estimateUserOperationGas(
    userOp: Record<string, unknown>,
    entryPoint: string,
  ): Promise<GasEstimate> {
    return this.call<GasEstimate>("eth_estimateUserOperationGas", [userOp, entryPoint]);
  }

  /**
   * Sends a user operation to the bundler
   *
   * @param userOp - The signed user operation to send
   * @param entryPoint - The entry point address
   * @returns The user operation hash
   */
  async sendUserOperation(userOp: Record<string, unknown>, entryPoint: string): Promise<string> {
    return this.call<string>("eth_sendUserOperation", [userOp, entryPoint]);
  }

  /**
   * Gets the receipt for a user operation
   *
   * @param userOpHash - The user operation hash to query
   * @returns The receipt or null if not yet available
   */
  async getUserOperationReceipt(userOpHash: string): Promise<UserOperationReceipt | null> {
    return this.call<UserOperationReceipt | null>("eth_getUserOperationReceipt", [userOpHash]);
  }

  /**
   * Makes a JSON-RPC call to the bundler
   *
   * @param method - The JSON-RPC method name
   * @param params - The JSON-RPC parameters
   * @returns The RPC result
   */
  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const requestPayload = {
      jsonrpc: "2.0" as const,
      id: 1,
      method,
      params,
    };

    let lastError: Error | undefined;
    const maxAttempts = this.config.retries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const res = await fetch(this.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new BundlerError(`Bundler HTTP error: ${res.status} ${res.statusText}`, {
            method,
            bundlerUrl: this.rpcUrl,
          });
        }

        const json = (await res.json()) as JsonRpcResponse<T>;

        if (json.error) {
          throw new BundlerError(json.error.message ?? "Bundler RPC error", {
            code: json.error.code,
            data: json.error.data,
            method,
            bundlerUrl: this.rpcUrl,
          });
        }

        if (json.result === undefined) {
          throw new BundlerError("Bundler RPC returned no result", {
            method,
            bundlerUrl: this.rpcUrl,
          });
        }

        return json.result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If it's an abort error (timeout), don't retry
        if (error instanceof Error && error.name === "AbortError") {
          throw new BundlerError(`Bundler request timeout after ${this.config.timeout}ms`, {
            method,
            bundlerUrl: this.rpcUrl,
            cause: error,
          });
        }

        // If this is the last attempt, throw the error
        if (attempt === maxAttempts - 1) {
          if (error instanceof BundlerError) {
            throw error;
          }
          throw new BundlerError(`Bundler request failed: ${lastError.message}`, {
            method,
            bundlerUrl: this.rpcUrl,
            cause: lastError,
          });
        }

        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new BundlerError("Bundler request failed after retries", {
      method,
      bundlerUrl: this.rpcUrl,
      cause: lastError,
    });
  }
}
