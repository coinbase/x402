
/**
 * ClientEvmSigner - Used by x402 clients to sign payment authorizations
 * This is typically a LocalAccount or wallet that holds private keys
 * and can sign EIP-712 typed data for payment authorizations
 */
export type ClientEvmSigner = {
  readonly address: `0x${string}`;
  signTypedData(message: { domain: any, types: any, primaryType: any, message: any }): Promise<`0x${string}`>;
}

/**
 * FacilitatorEvmSigner - Used by x402 facilitators to verify and settle payments
 * This is typically a viem PublicClient + WalletClient combination that can
 * read contract state, verify signatures, write transactions, and wait for receipts
 */
export type FacilitatorEvmSigner = {
  readContract(args: {
    address: `0x${string}`;
    abi: any;
    functionName: string;
    args?: any[];
  }): Promise<any>;
  verifyTypedData(args: {
    address: `0x${string}`;
    domain: any;
    types: any;
    primaryType: string;
    message: any;
    signature: `0x${string}`;
  }): Promise<boolean>;
  writeContract(args: {
    address: `0x${string}`;
    abi: any;
    functionName: string;
    args: any[];
  }): Promise<`0x${string}`>;
  waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: string }>;
}

/**
 * Converts a signer to a ClientEvmSigner
 * @param signer - The signer to convert to a ClientEvmSigner
 * @returns The converted signer
 */
export function toClientEvmSigner(signer: ClientEvmSigner): ClientEvmSigner {
  return signer;
}

/**
 * Converts a client to a FacilitatorEvmSigner
 * @param client - The client to convert to a FacilitatorEvmSigner
 * @returns The converted client
 */
export function toFacilitatorEvmSigner(client: FacilitatorEvmSigner): FacilitatorEvmSigner {
  return client;
}
