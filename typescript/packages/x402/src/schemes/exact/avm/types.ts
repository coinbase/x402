import algosdk from "algosdk";

/**
 * Represents a wallet account with address and name
 */
export interface WalletAccount {
  /** The Algorand address of the account */
  address: string;
  /** The name of the account */
  name?: string;
  /** Sign transactions with the wallet */
  signTransactions: (
    txns: Uint8Array[],
    indexesToSign?: number[],
  ) => Promise<(Uint8Array | null)[]>;
  /** The Algorand client instance */
  client: algosdk.Algodv2;
}

/**
 * Represents a wallet provider that can connect and sign transactions
 */
export interface WalletProvider {
  /** The ID of the wallet provider */
  id: string;
  /** Whether the wallet is connected */
  isConnected: boolean;
  /** The accounts available in the wallet */
  accounts: WalletAccount[];
  /** Connect to the wallet */
  connect: () => Promise<string[]>;
  /** Disconnect from the wallet */
  disconnect: () => Promise<void>;
  /** Sign transactions with the wallet */
  signTransactions: (
    txns: Uint8Array[],
    indexesToSign?: number[],
  ) => Promise<(Uint8Array | null)[]>;
}

/**
 * Represents the Algorand client for blockchain interactions
 */
export interface AlgorandClient {
  /** The Algorand client instance */
  client: algosdk.Algodv2;
  /** The network ID */
  network: string;
}
