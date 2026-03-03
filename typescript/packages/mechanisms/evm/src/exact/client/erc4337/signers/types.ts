import type { PreparedUserOperation } from "../bundler";

/**
 * Abstract interface for signing user operations.
 * This allows different signer implementations (Safe, EOA, etc.)
 */
export interface UserOperationSigner {
  /**
   * The address of the signer
   */
  readonly address: `0x${string}`;

  /**
   * Signs a prepared (unsigned) user operation.
   *
   * @param userOp - The prepared user operation to sign
   * @returns Promise resolving to the signature
   */
  signUserOperation(userOp: PreparedUserOperation): Promise<`0x${string}`>;
}
