import type { SmartAccount } from "viem/account-abstraction";
import type { PreparedUserOperation } from "../bundler";
import type { UserOperationSigner } from "./types";

/**
 * Adapter to make a SmartAccount (e.g., Safe account) work as a UserOperationSigner.
 *
 * This class wraps a SmartAccount that supports `signUserOperation` and adapts it
 * to the UserOperationSigner interface required by the x402 ERC-4337 scheme.
 */
export class SafeAccountSigner implements UserOperationSigner {
  readonly address: `0x${string}`;

  /**
   * Creates a new SafeAccountSigner instance.
   *
   * @param account - The SmartAccount instance (e.g., from permissionless/accounts)
   * @throws Error if the account is not initialized or missing an address
   */
  constructor(private readonly account: SmartAccount) {
    if (!account?.address) {
      throw new Error("Smart account not initialized");
    }
    this.address = account.address as `0x${string}`;
  }

  /**
   * Signs a prepared (unsigned) user operation.
   *
   * @param userOp - The prepared user operation to sign
   * @returns Promise resolving to the signature
   * @throws Error if the account does not support signUserOperation
   */
  async signUserOperation(userOp: PreparedUserOperation): Promise<`0x${string}`> {
    if (!this.account?.signUserOperation) {
      throw new Error("Smart account does not support signUserOperation");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await this.account.signUserOperation(userOp as any);
  }
}
