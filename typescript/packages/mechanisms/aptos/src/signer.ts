import {
  Account,
  Ed25519PrivateKey,
  Aptos,
  AptosConfig,
  SimpleTransaction,
  AccountAuthenticator,
  type PendingTransactionResponse,
} from "@aptos-labs/ts-sdk";
import { getAptosNetwork, getAptosRpcUrl } from "./constants";

/**
 * Client-side signer for creating and signing Aptos transactions
 * This is the Aptos Account type from @aptos-labs/ts-sdk
 */
export type ClientAptosSigner = Account;

/**
 * Configuration for client operations
 */
export type ClientAptosConfig = {
  /**
   * Optional custom RPC URL for the client to use
   */
  rpcUrl?: string;
};

/**
 * Minimal facilitator signer interface for Aptos operations.
 * Supports sponsored transactions where the facilitator pays gas fees.
 */
export type FacilitatorAptosSigner = {
  /**
   * Get the address that will act as fee payer for sponsored transactions
   *
   * @returns The fee payer address
   */
  getAddress(): string;

  /**
   * Sign a transaction as the fee payer and submit it
   *
   * @param transaction - The SimpleTransaction to sponsor
   * @param senderAuthenticator - The sender's authenticator
   * @param network - CAIP-2 network identifier
   * @returns The pending transaction response
   */
  signAndSubmitAsFeePayer(
    transaction: SimpleTransaction,
    senderAuthenticator: AccountAuthenticator,
    network: string,
  ): Promise<PendingTransactionResponse>;

  /**
   * Submit a fully-signed transaction (non-sponsored)
   *
   * @param transaction - The SimpleTransaction
   * @param senderAuthenticator - The sender's authenticator
   * @param network - CAIP-2 network identifier
   * @returns The pending transaction response
   */
  submitTransaction(
    transaction: SimpleTransaction,
    senderAuthenticator: AccountAuthenticator,
    network: string,
  ): Promise<PendingTransactionResponse>;

  /**
   * Simulate a transaction to verify it would succeed
   *
   * @param transaction - The transaction to simulate
   * @param network - CAIP-2 network identifier
   */
  simulateTransaction(transaction: SimpleTransaction, network: string): Promise<void>;

  /**
   * Wait for transaction confirmation
   *
   * @param txHash - The transaction hash to wait for
   * @param network - CAIP-2 network identifier
   */
  waitForTransaction(txHash: string, network: string): Promise<void>;
};

/**
 * Creates a client signer from a private key
 *
 * @param privateKey - The private key as a hex string (with or without 0x prefix)
 * @returns An Aptos Account instance
 */
export async function createClientSigner(privateKey: string): Promise<ClientAptosSigner> {
  const privateKeyBytes = new Ed25519PrivateKey(privateKey);
  return Account.fromPrivateKey({ privateKey: privateKeyBytes });
}

/**
 * Create a facilitator signer from an Aptos Account
 *
 * @param account - The Aptos Account that will act as fee payer
 * @param rpcConfig - Optional RPC configuration (per-network or default URL)
 * @returns A FacilitatorAptosSigner
 */
export function toFacilitatorAptosSigner(
  account: Account,
  rpcConfig?: { defaultRpcUrl?: string } | Record<string, string>,
): FacilitatorAptosSigner {
  const getRpcUrl = (network: string): string => {
    if (rpcConfig) {
      if ("defaultRpcUrl" in rpcConfig && rpcConfig.defaultRpcUrl) {
        return rpcConfig.defaultRpcUrl;
      }
      if (network in rpcConfig) {
        return (rpcConfig as Record<string, string>)[network];
      }
    }
    return getAptosRpcUrl(getAptosNetwork(network));
  };

  const getAptos = (network: string): Aptos => {
    const aptosNetwork = getAptosNetwork(network);
    const rpcUrl = getRpcUrl(network);
    const config = new AptosConfig({
      network: aptosNetwork,
      fullnode: rpcUrl,
    });
    return new Aptos(config);
  };

  return {
    getAddress: () => account.accountAddress.toStringLong(),

    signAndSubmitAsFeePayer: async (
      transaction: SimpleTransaction,
      senderAuthenticator: AccountAuthenticator,
      network: string,
    ) => {
      const aptos = getAptos(network);

      // Set this account as the fee payer
      transaction.feePayerAddress = account.accountAddress;

      // Sign as fee payer
      const feePayerAuthenticator = aptos.transaction.signAsFeePayer({
        signer: account,
        transaction,
      });

      // Submit with both signatures
      return aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator,
        feePayerAuthenticator,
      });
    },

    submitTransaction: async (
      transaction: SimpleTransaction,
      senderAuthenticator: AccountAuthenticator,
      network: string,
    ) => {
      const aptos = getAptos(network);
      return aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator,
      });
    },

    simulateTransaction: async (transaction: SimpleTransaction, network: string) => {
      const aptos = getAptos(network);
      const results = await aptos.transaction.simulate.simple({
        transaction,
      });

      if (results.length === 0 || !results[0].success) {
        const vmStatus = results[0]?.vm_status || "unknown error";
        throw new Error(`Simulation failed: ${vmStatus}`);
      }
    },

    waitForTransaction: async (txHash: string, network: string) => {
      const aptos = getAptos(network);
      await aptos.waitForTransaction({ transactionHash: txHash });
    },
  };
}
