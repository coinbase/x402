import { useCallback, useEffect, useMemo, useState } from "react";
import algosdk from "algosdk";
import {
  NetworkConfigBuilder,
  NetworkId,
  WalletId,
  WalletManager,
  type WalletAccount,
} from "@txnlab/use-wallet";

const ALGOD_TOKEN = "";

export type AlgorandNetwork = "algorand" | "algorand-testnet";

export interface UseAlgorandWalletResult {
  activeAddress?: string;
  accounts: WalletAccount[];
  connecting: boolean;
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransactions: (
    transactions: Uint8Array[],
    indexesToSign?: number[],
  ) => Promise<(Uint8Array | null)[]>;
  setActiveAccount: (account?: WalletAccount) => void;
}

/**
 * React hook for managing Algorand wallet connections, accounts, and transaction signing.
 *
 * @param network - The Algorand network to connect to ("algorand" for mainnet or "algorand-testnet" for testnet).
 * @param algodClient - An instance of algosdk.Algodv2 used for interacting with the Algorand blockchain.
 * @returns An object containing wallet state, connection methods, and transaction signing utilities.
 */
export function useAlgorandWallet(
  network: AlgorandNetwork,
  algodClient: algosdk.Algodv2,
): UseAlgorandWalletResult {
  const manager = useMemo(() => {
    const builder = new NetworkConfigBuilder();

    builder.mainnet({
      algod: {
        token: ALGOD_TOKEN,
        baseServer: "https://mainnet-api.algonode.cloud",
      },
    });

    builder.testnet({
      algod: {
        token: ALGOD_TOKEN,
        baseServer: "https://testnet-api.algonode.cloud",
      },
    });

    const networks = builder.build();
    const defaultNetwork = network === "algorand" ? NetworkId.MAINNET : NetworkId.TESTNET;

    const instance = new WalletManager({
      wallets: [WalletId.PERA],
      networks,
      defaultNetwork,
      options: {
        resetNetwork: false,
      },
    });

    instance.algodClient = algodClient;
    return instance;
  }, [network, algodClient]);

  const [activeAddress, setActiveAddress] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleUpdate = () => {
      const walletAccounts = manager.activeWallet?.accounts ?? [];
      setAccounts(walletAccounts);
      setActiveAddress(manager.activeAddress ?? undefined);
    };

    handleUpdate();

    const unsubscribe = manager.subscribe(() => handleUpdate());

    manager.resumeSessions().catch(err => {
      console.error("Failed to resume Algorand wallet session", err);
    });

    return () => {
      unsubscribe();
      manager.disconnect().catch(err => {
        console.error("Failed to disconnect Algorand wallet", err);
      });
    };
  }, [manager]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(undefined);

    try {
      const wallet = manager.getWallet(WalletId.PERA);
      if (!wallet) {
        throw new Error("Pera wallet is not available");
      }

      const connectedAccounts = await wallet.connect();
      if (connectedAccounts.length > 0) {
        wallet.setActiveAccount(connectedAccounts[0].address);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect wallet";
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [manager]);

  const disconnect = useCallback(async () => {
    setError(undefined);
    try {
      await manager.disconnect();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disconnect wallet";
      setError(message);
      throw err;
    }
  }, [manager]);

  const signTransactions = useCallback(
    async (transactions: Uint8Array[], indexesToSign?: number[]) => {
      try {
        const result = await manager.signTransactions(transactions, indexesToSign);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to sign transactions";
        setError(message);
        throw err;
      }
    },
    [manager],
  );

  const setActiveAccount = useCallback(
    (account?: WalletAccount) => {
      const wallet = manager.getWallet(WalletId.PERA);
      if (!wallet) {
        return;
      }
      if (account?.address) {
        wallet.setActiveAccount(account.address);
      }
    },
    [manager],
  );

  return {
    activeAddress,
    accounts,
    connecting,
    error,
    connect,
    disconnect,
    signTransactions,
    setActiveAccount,
  };
}
