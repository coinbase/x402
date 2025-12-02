/**
 * ClientEvmSigner - Used by x402 clients to sign payment authorizations
 * This is typically a LocalAccount or wallet that holds private keys
 * and can sign EIP-712 typed data for payment authorizations
 */
export type ClientEvmSigner = {
  readonly address: `0x${string}`;
  signTypedData(message: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
};

/**
 * FacilitatorEvmSigner - Used by x402 facilitators to verify and settle payments
 * This is typically a viem PublicClient + WalletClient combination that can
 * read contract state, verify signatures, write transactions, and wait for receipts
 */
export type FacilitatorEvmSigner = {
  readonly address: `0x${string}`;
  readContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  verifyTypedData(args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }): Promise<boolean>;
  writeContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<`0x${string}`>;
  sendTransaction(args: { to: `0x${string}`; data: `0x${string}` }): Promise<`0x${string}`>;
  waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: string }>;
  getCode(args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>;
};

/**
 * Converts a signer to a ClientEvmSigner
 *
 * @param signer - The signer to convert to a ClientEvmSigner
 * @returns The converted signer
 */
export function toClientEvmSigner(signer: ClientEvmSigner): ClientEvmSigner {
  return signer;
}

/**
 * Converts a client to a FacilitatorEvmSigner
 *
 * @param client - The client to convert to a FacilitatorEvmSigner
 * @returns The converted client
 */
export function toFacilitatorEvmSigner(client: FacilitatorEvmSigner): FacilitatorEvmSigner {
  return client;
}
