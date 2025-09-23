import * as evm from "./evm/wallet";
import * as svm from "../../shared/svm/wallet";
import type * as avm from "./avm";
import { Network, isEvmNetwork, isSvmNetwork } from "./network";
import { Hex } from "viem";

export type ConnectedClient = evm.ConnectedClient | svm.SvmConnectedClient | avm.AlgorandClient;
export type Signer = evm.EvmSigner | svm.SvmSigner | avm.WalletAccount;
export type MultiNetworkSigner = {
  evm: evm.EvmSigner;
  svm: svm.SvmSigner;
  avm?: avm.WalletAccount;
};

/**
 * Creates a public client configured for the specified network.
 *
 * @param network - The network to connect to.
 * @returns A public client instance connected to the specified chain.
 */
export function createConnectedClient(network: Network): ConnectedClient {
  if (isEvmNetwork(network)) {
    return evm.createConnectedClient(network);
  }

  if (isSvmNetwork(network)) {
    return svm.createSvmConnectedClient(network);
  }

  throw new Error(`Unsupported network: ${network}`);
}

/**
 * Creates a wallet client configured for the specified chain with a private key.
 *
 * @param network - The network to connect to.
 * @param privateKey - The private key to use for signing transactions.
 * @returns A wallet client instance connected to the specified chain with the provided private key.
 */
export function createSigner(network: Network, privateKey: Hex | string): Promise<Signer> {
  // evm
  if (isEvmNetwork(network)) {
    return Promise.resolve(evm.createSigner(network, privateKey as Hex));
  }

  // svm
  if (isSvmNetwork(network)) {
    return svm.createSignerFromBase58(privateKey as string);
  }

  throw new Error(`Unsupported network: ${network}`);
}

/**
 * Checks if the given wallet is an EVM signer wallet.
 *
 * @param wallet - The object wallet to check.
 * @returns True if the wallet is an EVM signer wallet, false otherwise.
 */
export function isEvmSignerWallet(wallet: Signer): wallet is evm.EvmSigner {
  return evm.isSignerWallet(wallet as evm.EvmSigner) || evm.isAccount(wallet as evm.EvmSigner);
}

/**
 * Checks if the given wallet is an SVM signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is an SVM signer wallet, false otherwise
 */
export function isSvmSignerWallet(wallet: Signer): wallet is svm.SvmSigner {
  return svm.isSignerWallet(wallet as svm.SvmSigner);
}

/**
 * Checks if the given wallet is an Algorand wallet account.
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is an Algorand wallet account, false otherwise
 */
export function isAvmSignerWallet(wallet: Signer): wallet is avm.WalletAccount {
  return (
    typeof (wallet as avm.WalletAccount)?.address === "string" &&
    typeof (wallet as avm.WalletAccount)?.signTransactions === "function"
  );
}

/**
 * Resolves an Algorand wallet from a signer or multi-network signer.
 *
 * @param wallet - The wallet to resolve
 * @returns The Algorand wallet account if available, undefined otherwise
 */
export function resolveAvmWallet(
  wallet: Signer | MultiNetworkSigner,
): avm.WalletAccount | undefined {
  if (isMultiNetworkSigner(wallet)) {
    return wallet.avm;
  }

  if (isAvmSignerWallet(wallet)) {
    return wallet;
  }

  return undefined;
}

/**
 * Checks if the given wallet is a multi network signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is a multi network signer wallet, false otherwise
 */
export function isMultiNetworkSigner(wallet: object): wallet is MultiNetworkSigner {
  return "evm" in wallet && "svm" in wallet;
}
