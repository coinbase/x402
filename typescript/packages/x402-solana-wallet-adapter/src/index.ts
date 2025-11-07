/**
 * @b3dotfun/anyspend-x402-solana-wallet-adapter
 *
 * Solana wallet-adapter bridge for x402 payment protocol.
 * Connects @solana/wallet-adapter (v1) with x402 library (v2).
 *
 * @example
 * ```typescript
 * import { useWallet } from '@solana/wallet-adapter-react';
 * import { createWalletAdapterSigner } from '@b3dotfun/anyspend-x402-solana-wallet-adapter';
 * import { wrapFetchWithPayment } from '@b3dotfun/anyspend-x402-fetch';
 *
 * const { publicKey, signAllTransactions } = useWallet();
 * const signer = createWalletAdapterSigner(publicKey.toBase58(), signAllTransactions);
 * const fetchWithPayment = wrapFetchWithPayment(fetch, signer);
 * ```
 */

export {
  createWalletAdapterSigner,
  type TransactionSigner,
  type V2Transaction,
} from "./createWalletAdapterSigner";
