import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createWalletClient, custom, type WalletClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { Hex } from 'viem';

interface WalletContextType {
  isConnected: boolean;
  address: Hex | null;
  walletClient: WalletClient | null;
  error: string | null;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<Hex | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if wallet is already connected on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ 
          method: 'eth_accounts' 
        }) as string[];
        
        if (accounts.length > 0) {
          const client = createWalletClient({
            account: accounts[0] as Hex,
            chain: baseSepolia,
            transport: custom(window.ethereum)
          });
          
          setWalletClient(client);
          setAddress(accounts[0] as Hex);
          setIsConnected(true);
        }
      } catch (err) {
        console.error('Failed to check wallet connection:', err);
      }
    }
  };

  const connectWallet = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('Please install MetaMask or another Ethereum wallet');
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      }) as string[];
      
      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      // Check if on correct network (Base Sepolia)
      const chainId = await window.ethereum.request({ 
        method: 'eth_chainId' 
      }) as string;
      
      const baseSepoliaChainIdHex = '0x14a34'; // 84532 in hex
      
      if (chainId !== baseSepoliaChainIdHex) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: baseSepoliaChainIdHex }],
          });
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to browser wallet
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: baseSepoliaChainIdHex,
                chainName: 'Base Sepolia',
                nativeCurrency: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: ['https://sepolia.base.org'],
                blockExplorerUrls: ['https://sepolia.basescan.org'],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      // Create viem wallet client
      const client = createWalletClient({
        account: accounts[0] as Hex,
        chain: baseSepolia,
        transport: custom(window.ethereum)
      });

      setWalletClient(client);
      setAddress(accounts[0] as Hex);
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      console.error('Wallet connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWalletClient(null);
    setAddress(null);
    setIsConnected(false);
    setError(null);
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = async (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (accounts[0] !== address) {
          // Re-connect with new account
          const client = createWalletClient({
            account: accounts[0] as Hex,
            chain: baseSepolia,
            transport: custom(window.ethereum)
          });
          
          setWalletClient(client);
          setAddress(accounts[0] as Hex);
          setIsConnected(true);
        }
      };

      const handleChainChanged = () => {
        
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [address, disconnectWallet]);

  const value: WalletContextType = {
    isConnected,
    address,
    walletClient,
    error,
    isConnecting,
    connectWallet,
    disconnectWallet,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
} 