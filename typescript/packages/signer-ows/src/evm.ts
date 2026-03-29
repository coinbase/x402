import {
  getWallet,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";

/**
 * Options for creating an OWS-backed EVM client signer.
 */
export interface OwsEvmSignerOptions {
  /** CAIP-2 chain ID (default: "eip155:8453" for Base mainnet). */
  chain?: string;
  /** Vault passphrase. Omit for unlocked/dev mode. */
  passphrase?: string;
  /** BIP-44 account index (default: 0). */
  index?: number;
  /** Custom vault path (default: ~/.ows). */
  vaultPath?: string;
}

/**
 * Structural match for x402 ClientEvmSigner.
 * Returned by owsToClientEvmSigner — pass directly to ExactEvmScheme.
 */
export interface OwsClientEvmSigner {
  readonly address: `0x${string}`;
  signTypedData(message: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
}

/**
 * Creates a ClientEvmSigner backed by an OWS wallet.
 *
 * The returned signer satisfies the x402 ClientEvmSigner interface
 * and delegates all signing to OWS (keys never leave the vault).
 *
 * @param walletName - OWS wallet name or ID
 * @param options - Optional chain, passphrase, index, vault path
 * @returns A ClientEvmSigner for use with ExactEvmScheme
 *
 * @example
 * ```ts
 * import { owsToClientEvmSigner } from "@x402/signer-ows/evm";
 * import { ExactEvmScheme } from "@x402/evm/exact/client";
 * import { x402Client } from "@x402/core";
 *
 * const signer = owsToClientEvmSigner("agent-treasury");
 * const client = new x402Client()
 *   .register("eip155:*", new ExactEvmScheme(signer));
 * ```
 */
export function owsToClientEvmSigner(
  walletName: string,
  options?: OwsEvmSignerOptions,
): OwsClientEvmSigner {
  const chain = options?.chain ?? "eip155:8453";
  const wallet = getWallet(walletName, options?.vaultPath);

  const account =
    wallet.accounts.find(a => a.chainId === chain) ??
    wallet.accounts.find(a => a.chainId.startsWith("eip155:"));

  if (!account) {
    throw new Error(
      `No EVM account found in wallet "${walletName}". ` +
        `Available chains: ${wallet.accounts.map(a => a.chainId).join(", ")}`,
    );
  }

  const address = account.address as `0x${string}`;

  return {
    address,
    async signTypedData(message) {
      const typedData = {
        types: message.types,
        primaryType: message.primaryType,
        domain: message.domain,
        message: message.message,
      };

      const result = owsSignTypedData(
        walletName,
        chain,
        JSON.stringify(typedData),
        options?.passphrase,
        options?.index,
        options?.vaultPath,
      );

      const sig = result.signature.startsWith("0x")
        ? result.signature
        : `0x${result.signature}`;
      return sig as `0x${string}`;
    },
  };
}
