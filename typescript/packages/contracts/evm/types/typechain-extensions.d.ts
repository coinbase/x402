/**
 * Type augmentations for TypeChain-generated types
 * This extends the Lock interface to include BaseContract properties
 * that are available at runtime but not in the generated types
 */

import type { AddressLike, ContractRunner } from "ethers";

declare module "../typechain-types/Lock" {
  interface Lock {
    /**
     * The deployed contract address
     */
    readonly target: string;
    
    /**
     * Get the address of the deployed contract
     * @returns The contract address
     */
    getAddress(): Promise<string>;
    
    /**
     * The contract runner (signer or provider)
     */
    readonly runner: ContractRunner | null;
  }
}

