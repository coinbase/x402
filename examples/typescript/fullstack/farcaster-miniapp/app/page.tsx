"use client";

import {
  useMiniKit,
  useAddFrame,
} from "@coinbase/onchainkit/minikit";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { sdk } from "@farcaster/frame-sdk";
import { wrapFetchWithPayment } from "x402-fetch";
import { getWalletClient } from "wagmi/actions";
import { createConfig, http } from "@wagmi/core";
import { base, baseSepolia } from "@wagmi/core/chains";
import { createClient } from "viem";

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [frameAdded, setFrameAdded] = useState(false);
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const { address, isConnected, connector, chainId } = useAccount();

  const addFrame = useAddFrame();

  const config = createConfig({
    chains: [base, baseSepolia],
    client({ chain }) {
      return createClient({ chain, transport: http() });
    },
  });

  // Initialize Farcaster Mini App SDK
  useEffect(() => {
    const initMiniApp = async () => {
      try {
        await sdk.actions.ready();
        const isInMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(isInMiniApp);
      } catch (error) {
        console.log('Not running in Mini App context or SDK not available:', error);
      }
    };

    initMiniApp();
  }, []);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  const handleAddFrame = useCallback(async () => {
    const frameAdded = await addFrame();
    setFrameAdded(Boolean(frameAdded));
  }, [addFrame]);

  const handleProtectedAction = useCallback(async () => {
    if (!isConnected) {
      setMessage("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setMessage("");

    const walletClient = await getWalletClient(config, {
      account: address,
      chainId: chainId,
      connector: connector,
    });

    if (!walletClient) {
      setMessage("Wallet client not available");
      return;
    }

    // For x402-fetch, we need to pass the wallet client's account
    const fetchWithPayment = wrapFetchWithPayment(
      fetch,
      walletClient as unknown as Parameters<typeof wrapFetchWithPayment>[1]
    );

    try {
      const response = await fetchWithPayment("/api/protected", {
        method: "GET",
      });

      if (!response.ok) {
        console.log(response)
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessage(`Success! Response: ${JSON.stringify(data)}`);
    } catch (error) {
      console.error("Error calling protected API:", error);
      setMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, chainId, connector, config]);

  const saveFrameButton = useMemo(() => {
    if (context && !context.client.added) {
      return (
        <button
          onClick={handleAddFrame}
          className="text-blue-600 hover:text-blue-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          Save Frame
        </button>
      );
    }

    if (frameAdded) {
      return (
        <div className="flex items-center space-x-1 text-sm font-medium text-green-600 dark:text-green-400">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>Saved</span>
        </div>
      );
    }

    return null;
  }, [context, frameAdded, handleAddFrame]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">x402 Mini App Template</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isInMiniApp ? 'Running as Mini App' : 'Running in browser'}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex-shrink-0">
                <Wallet className="z-10">
                  <ConnectWallet>
                    <Name className="text-inherit" />
                  </ConnectWallet>
                  <WalletDropdown>
                    <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                      <Avatar />
                      <Name />
                      <Address />
                      <EthBalance />
                    </Identity>
                    <WalletDropdownDisconnect />
                  </WalletDropdown>
                </Wallet>
              </div>
              <div>{saveFrameButton}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Hero Section */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              Welcome to Your Mini App
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              This is a clean template with x402, OnchainKit, and Farcaster as a mini app.
            </p>
          </div>

          {/* Connection Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Connection Status
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Wallet Connected:</span>
                <span className={`font-medium ${isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isConnected ? 'Yes' : 'No'}
                </span>
              </div>
              {isConnected && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Address:</span>
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Chain ID:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{chainId}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Mini App Context:</span>
                <span className={`font-medium ${isInMiniApp ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {isInMiniApp ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Protected Action */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Protected Action
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              This button calls the x402 protected API endpoint.
            </p>
            <button
              onClick={handleProtectedAction}
              disabled={!isConnected || isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${!isConnected || isLoading
                ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Processing...</span>
                </div>
              ) : (
                'Call Protected API'
              )}
            </button>
            {message && (
              <div className={`mt-4 p-4 rounded-lg border ${message.startsWith('Error')
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                }`}>
                <div className="flex items-center space-x-2">
                  {message.startsWith('Error') ? (
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="font-medium">{message}</span>
                </div>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
              Getting Started
            </h3>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p>• Connect your wallet using the button in the header</p>
              <p>• The app will automatically detect if it&apos;s running in a Farcaster Mini App</p>
              <p>• Use the &quot;Call Protected API&quot; button to test the protected endpoint</p>
              <p>• Customize this template by adding your own features and logic</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
