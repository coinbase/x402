import { isWalletACoinbaseSmartWallet } from "@coinbase/onchainkit/wallet";
import { useState, useEffect } from "react";
import { PublicClient, RpcUserOperation } from "viem";
import { useAccount, usePublicClient } from "wagmi";

/**
 * Checks the wallet connector ID and the wallet capabilities to determine if the currently connected wallet is a
 * Coinbase Smart Wallet.
 *
 * @returns true if the wallet is a Coinbase Smart Wallet, false otherwise.
 */
export function useIsWalletACoinbaseSmartWallet(): boolean {
  const { address } = useAccount();
  const client = usePublicClient();
  const [isSmartWallet, setIsSmartWallet] = useState(false);

  useEffect(() => {
    /**
     * Checks if the wallet is a Coinbase Smart Wallet.
     */
    async function checkSmartWallet() {
      try {
        if (!address || !client) {
          setIsSmartWallet(false);
          return;
        }

        // Use type assertions to handle viem version differences
        const result = await isWalletACoinbaseSmartWallet({
          client: client as PublicClient,
          userOp: { sender: address } as RpcUserOperation<"0.6">,
        });
        setIsSmartWallet(!!result);
      } catch (error) {
        console.error(error);
        setIsSmartWallet(false);
      }
    }

    void checkSmartWallet();
  }, [address, client]);

  return isSmartWallet;
}
