import {
  getWallet,
  signMessage as owsSignMessage,
} from "@open-wallet-standard/core";
import type { Address } from "@solana/kit";

/**
 * Options for creating an OWS-backed SVM client signer.
 */
export interface OwsSvmSignerOptions {
  /** CAIP-2 chain ID (default: Solana mainnet). */
  chain?: string;
  /** Vault passphrase. Omit for unlocked/dev mode. */
  passphrase?: string;
  /** BIP-44 account index (default: 0). */
  index?: number;
  /** Custom vault path (default: ~/.ows). */
  vaultPath?: string;
}

/** Solana mainnet CAIP-2 identifier. */
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array | ReadonlyUint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

type ReadonlyUint8Array = Readonly<Uint8Array> & { readonly [n: number]: number };

/**
 * A transaction-like object with messageBytes and signatures.
 * Matches the @solana/kit Transaction shape.
 */
interface SolanaTransaction {
  readonly messageBytes: ReadonlyUint8Array;
  readonly signatures: Readonly<Record<string, ReadonlyUint8Array>>;
}

/**
 * Structural match for @solana/kit TransactionSigner (= x402 ClientSvmSigner).
 * Returned by owsToClientSvmSigner — pass directly to ExactSvmScheme.
 */
export interface OwsClientSvmSigner {
  readonly address: Address;
  signTransactions<T extends SolanaTransaction>(
    transactions: readonly T[],
  ): Promise<readonly T[]>;
}

/**
 * Creates a ClientSvmSigner (TransactionSigner) backed by an OWS wallet.
 *
 * The returned signer satisfies the @solana/kit TransactionSigner interface
 * and delegates Ed25519 signing to OWS (keys never leave the vault).
 *
 * @param walletName - OWS wallet name or ID
 * @param options - Optional chain, passphrase, index, vault path
 * @returns A TransactionSigner for use with ExactSvmScheme
 *
 * @example
 * ```ts
 * import { owsToClientSvmSigner } from "@x402/signer-ows/svm";
 * import { ExactSvmScheme } from "@x402/svm/exact/client";
 * import { x402Client } from "@x402/core";
 *
 * const signer = owsToClientSvmSigner("agent-treasury");
 * const client = new x402Client()
 *   .register("solana:*", new ExactSvmScheme(signer));
 * ```
 */
export function owsToClientSvmSigner(
  walletName: string,
  options?: OwsSvmSignerOptions,
): OwsClientSvmSigner {
  const chain = options?.chain ?? SOLANA_MAINNET;
  const wallet = getWallet(walletName, options?.vaultPath);

  const account =
    wallet.accounts.find(a => a.chainId === chain) ??
    wallet.accounts.find(a => a.chainId.startsWith("solana:"));

  if (!account) {
    throw new Error(
      `No Solana account found in wallet "${walletName}". ` +
        `Available chains: ${wallet.accounts.map(a => a.chainId).join(", ")}`,
    );
  }

  const address = account.address as Address;

  return {
    address,
    async signTransactions<T extends SolanaTransaction>(
      transactions: readonly T[],
    ): Promise<readonly T[]> {
      return transactions.map(tx => {
        const msgHex = bytesToHex(tx.messageBytes);

        const result = owsSignMessage(
          walletName,
          chain,
          msgHex,
          options?.passphrase,
          "hex",
          options?.index,
          options?.vaultPath,
        );

        const sigBytes = hexToBytes(result.signature);

        return {
          ...tx,
          signatures: Object.freeze({
            ...tx.signatures,
            [address]: sigBytes,
          }),
        } as T;
      });
    },
  };
}
