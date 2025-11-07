/**
 * Solana wallet-adapter bridge for x402 payment protocol.
 * Connects @solana/wallet-adapter (v1) with x402 library (v2).
 *
 * Example usage:
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

export { createWalletAdapterSigner, type V2Transaction } from "./createWalletAdapterSigner";
export type { TransactionSigner } from "@solana/kit";

// Export React components with proper types
export {
  ConnectionProvider,
  WalletProvider,
  WalletModalProvider,
  WalletMultiButton,
  useWallet,
  type ConnectionProviderProps,
  type WalletProviderProps,
  type WalletModalProviderProps,
  type WalletMultiButtonProps,
} from "./components";
