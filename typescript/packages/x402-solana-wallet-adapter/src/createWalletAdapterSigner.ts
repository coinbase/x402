/**
 * Solana TransactionSigner Adapter for X402
 *
 * Bridges between the x402 library (@solana/web3.js v2 format) and
 * Solana wallet adapters (@solana/web3.js v1 format).
 *
 * The x402 library uses @solana/kit's TransactionSigner interface which expects:
 * - address: string
 * - signTransactions: (txs: v2[]) => Promise<Array<{ address: Uint8Array(64) }>>
 *
 * Wallet adapters use @solana/web3.js v1 VersionedTransaction format.
 * This adapter handles the conversion between the two formats.
 */

import { VersionedTransaction, PublicKey } from "@solana/web3.js";

/**
 * Transaction format used by x402 library (@solana/web3.js v2)
 */
export interface V2Transaction {
  messageBytes: Uint8Array;
  signatures: Record<string, null>;
  lifetimeConstraint?: {
    blockhash: string;
    lastValidBlockHeight: bigint;
  };
}

/**
 * Signature function from wallet adapter
 */
type SignAllTransactions = (
  transactions: VersionedTransaction[],
) => Promise<VersionedTransaction[]>;

/**
 * Union type for transactions that can be signed
 */
type SignableTransaction = V2Transaction | VersionedTransaction;

/**
 * TransactionSigner interface compatible with @solana/kit
 */
export interface TransactionSigner {
  address: string;
  signTransactions: (
    transactions: SignableTransaction[],
  ) => Promise<Array<{ [address: string]: Uint8Array }>>;
}

/**
 * Type guard to check if a transaction is a V2Transaction
 */
function isV2Transaction(tx: SignableTransaction): tx is V2Transaction {
  return (
    "messageBytes" in tx &&
    tx.messageBytes instanceof Uint8Array &&
    "signatures" in tx &&
    typeof tx.signatures === "object"
  );
}

/**
 * Convert x402 v2 transaction format to VersionedTransaction for wallet signing
 *
 * @param tx - Transaction in v2 format or already a VersionedTransaction
 * @returns VersionedTransaction ready for wallet signing
 */
function convertToVersionedTransaction(tx: SignableTransaction): VersionedTransaction {
  if (tx instanceof VersionedTransaction) {
    return tx;
  }

  if (isV2Transaction(tx)) {
    const numSignatures = Object.keys(tx.signatures).length;
    const signaturesLength = 1 + numSignatures * 64;
    const fullTx = new Uint8Array(signaturesLength + tx.messageBytes.length);

    // Serialized format: [numSigs(1 byte), sig1(64 bytes), sig2(64 bytes), ..., message]
    fullTx[0] = numSignatures;
    fullTx.set(tx.messageBytes, signaturesLength);

    return VersionedTransaction.deserialize(fullTx);
  }

  throw new Error("Unsupported transaction format");
}

/**
 * Extract the 64-byte signature for a specific wallet from a signed transaction
 *
 * @param signedTx - Signed VersionedTransaction from wallet
 * @param walletAddress - The wallet's public key as base58 string
 * @returns Object mapping wallet address to its 64-byte signature
 */
function extractSignature(
  signedTx: VersionedTransaction,
  walletAddress: string,
): { [address: string]: Uint8Array } {
  const signerIndex = signedTx.message.staticAccountKeys.findIndex(
    (key: PublicKey) => key.toBase58() === walletAddress,
  );

  if (signerIndex === -1) {
    throw new Error(`Wallet address ${walletAddress} not found in transaction signers`);
  }

  const signature = signedTx.signatures[signerIndex];
  if (!signature) {
    throw new Error(
      `Signature not found for wallet address ${walletAddress} at index ${signerIndex}`,
    );
  }

  return { [walletAddress]: signature };
}

/**
 * Create a Solana TransactionSigner compatible with @solana/kit for use with x402
 *
 * @param walletAddress - The wallet's public key as base58 string
 * @param signAllTransactions - The wallet adapter's signAllTransactions function
 * @param onSign - Optional callback when transactions are being signed
 * @returns TransactionSigner instance for use with wrapFetchWithPayment
 *
 * @example
 * ```typescript
 * import { useWallet } from '@solana/wallet-adapter-react';
 * import { createWalletAdapterSigner } from '@b3dotfun/anyspend-x402-solana-wallet-adapter';
 * import { wrapFetchWithPayment } from '@b3dotfun/anyspend-x402-fetch';
 *
 * function MyComponent() {
 *   const { publicKey, signAllTransactions } = useWallet();
 *
 *   const signer = createWalletAdapterSigner(
 *     publicKey.toBase58(),
 *     signAllTransactions,
 *     (count) => console.log(`Signing ${count} transaction(s)`)
 *   );
 *
 *   const fetchWithPayment = wrapFetchWithPayment(fetch, signer);
 *
 *   // Use fetchWithPayment for x402 payment requests...
 * }
 * ```
 */
export function createWalletAdapterSigner(
  walletAddress: string,
  signAllTransactions: SignAllTransactions,
  onSign?: (count: number) => void,
): TransactionSigner {
  return {
    address: walletAddress,
    signTransactions: async (transactions: SignableTransaction[]) => {
      onSign?.(transactions.length);

      // Convert v2 format to VersionedTransaction
      const txsToSign = transactions.map(convertToVersionedTransaction);

      // Sign with wallet adapter
      const signedTxs = await signAllTransactions(txsToSign);

      // Extract and return only the 64-byte signatures
      return signedTxs.map(signedTx => extractSignature(signedTx, walletAddress));
    },
  };
}
