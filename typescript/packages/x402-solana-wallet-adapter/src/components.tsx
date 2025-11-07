/**
 * React component re-exports with proper TypeScript types for @solana/wallet-adapter
 *
 * These re-exports fix type compatibility issues between @solana/wallet-adapter
 * and newer versions of @types/react by explicitly typing the components.
 */

import type { FC, ReactNode } from 'react';
import type { WalletError } from '@solana/wallet-adapter-base';
import {
  ConnectionProvider as OriginalConnectionProvider,
  WalletProvider as OriginalWalletProvider,
} from '@solana/wallet-adapter-react';
import {
  WalletModalProvider as OriginalWalletModalProvider,
  WalletMultiButton as OriginalWalletMultiButton,
} from '@solana/wallet-adapter-react-ui';

/**
 * ConnectionProvider props
 */
export interface ConnectionProviderProps {
  children: ReactNode;
  endpoint: string;
  config?: any;
}

/**
 * WalletProvider props
 */
export interface WalletProviderProps {
  children: ReactNode;
  wallets: any[];
  autoConnect?: boolean;
  onError?: (error: WalletError) => void;
  localStorageKey?: string;
}

/**
 * WalletModalProvider props
 */
export interface WalletModalProviderProps {
  children: ReactNode;
}

/**
 * ConnectionProvider component - properly typed wrapper
 */
export const ConnectionProvider: FC<ConnectionProviderProps> =
  OriginalConnectionProvider as FC<ConnectionProviderProps>;

/**
 * WalletProvider component - properly typed wrapper
 */
export const WalletProvider: FC<WalletProviderProps> =
  OriginalWalletProvider as FC<WalletProviderProps>;

/**
 * WalletModalProvider component - properly typed wrapper
 */
export const WalletModalProvider: FC<WalletModalProviderProps> =
  OriginalWalletModalProvider as FC<WalletModalProviderProps>;

/**
 * WalletMultiButton props
 */
export interface WalletMultiButtonProps {
  className?: string;
}

/**
 * WalletMultiButton component - properly typed wrapper
 */
export const WalletMultiButton: FC<WalletMultiButtonProps> =
  OriginalWalletMultiButton as FC<WalletMultiButtonProps>;

// Re-export useWallet hook
export { useWallet } from '@solana/wallet-adapter-react';
