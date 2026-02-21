/**
 * ClientEvmSigner - Used by x402 clients to sign payment authorizations.
 *
 * Typically a viem WalletClient extended with publicActions:
 * ```typescript
 * const client = createWalletClient({
 *   account: privateKeyToAccount('0x...'),
 *   chain: baseSepolia,
 *   transport: http(),
 * }).extend(publicActions);
 * ```
 *
 * Or composed via `toClientEvmSigner(account, publicClient)`.
 */
export type ClientEvmSigner = {
  readonly address: `0x${string}`;
  signTypedData(message: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
  readContract(args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
};

/**
 * FacilitatorEvmSigner - Used by x402 facilitators to verify and settle payments
 * This is typically a viem PublicClient + WalletClient combination that can
 * read contract state, verify signatures, write transactions, and wait for receipts
 *
 * Supports multiple addresses for load balancing, key rotation, and high availability
 */
export type FacilitatorEvmSigner = {
  /**
   * Get all addresses this facilitator can use for signing
   * Enables dynamic address selection for load balancing and key rotation
   */
  getAddresses(): readonly `0x${string}`[];

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
  waitForTransactionReceipt(args: {
    hash: `0x${string}`;
    timeout?: number;
  }): Promise<{ status: string }>;
  getCode(args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>;
};

/**
 * Composes a ClientEvmSigner from a local account and a public client.
 *
 * Use this when your signer (e.g., `privateKeyToAccount`) doesn't have
 * `readContract`. The `publicClient` provides the on-chain read capability.
 *
 * Alternatively, use a WalletClient extended with publicActions directly:
 * ```typescript
 * const signer = createWalletClient({
 *   account: privateKeyToAccount('0x...'),
 *   chain: baseSepolia,
 *   transport: http(),
 * }).extend(publicActions);
 * ```
 *
 * @param signer - A signer with `address` and `signTypedData` (and optionally `readContract`)
 * @param publicClient - A client with `readContract` (required if signer lacks it)
 * @param publicClient.readContract - The readContract method from the public client
 * @returns A complete ClientEvmSigner
 *
 * @example
 * ```typescript
 * const account = privateKeyToAccount("0x...");
 * const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
 * const signer = toClientEvmSigner(account, publicClient);
 * ```
 */
export function toClientEvmSigner(
  signer: Omit<ClientEvmSigner, "readContract"> & {
    readContract?: ClientEvmSigner["readContract"];
  },
  publicClient?: {
    readContract(args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }): Promise<unknown>;
  },
): ClientEvmSigner {
  const readContract = signer.readContract ?? publicClient?.readContract.bind(publicClient);

  if (!readContract) {
    throw new Error(
      "toClientEvmSigner requires either a signer with readContract or a publicClient. " +
        "Use createWalletClient(...).extend(publicActions) or pass a publicClient.",
    );
  }

  return {
    address: signer.address,
    signTypedData: msg => signer.signTypedData(msg),
    readContract,
  };
}

/**
 * Converts a viem client with single address to a FacilitatorEvmSigner
 * Wraps the single address in a getAddresses() function for compatibility
 *
 * @param client - The client to convert (must have 'address' property)
 * @returns FacilitatorEvmSigner with getAddresses() support
 */
export function toFacilitatorEvmSigner(
  client: Omit<FacilitatorEvmSigner, "getAddresses"> & { address: `0x${string}` },
): FacilitatorEvmSigner {
  return {
    ...client,
    getAddresses: () => [client.address],
  };
}
