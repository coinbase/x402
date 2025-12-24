import * as evm from "./evm/wallet";
import * as svm from "../../shared/svm/wallet";
import * as aptos from "../../shared/aptos/wallet";
import { SupportedEVMNetworks, SupportedSVMNetworks, isAptosNetwork } from "./network";
import { Hex } from "viem";

export type ConnectedClient =
  | evm.ConnectedClient
  | svm.SvmConnectedClient
  | aptos.AptosConnectedClient;
export type Signer = evm.EvmSigner | svm.SvmSigner | aptos.AptosSigner;
export type MultiNetworkSigner = {
  evm: evm.EvmSigner;
  svm: svm.SvmSigner;
  aptos: aptos.AptosSigner;
};

export type AptosMultiNetworkSigner = {
  aptos: aptos.AptosSigner;
};

/**
 * Creates a public client configured for the specified network.
 *
 * @param network - The network to connect to.
 * @returns A public client instance connected to the specified chain.
 */
export function createConnectedClient(network: string): ConnectedClient {
  if (SupportedEVMNetworks.find(n => n === network)) {
    return evm.createConnectedClient(network);
  }

  if (SupportedSVMNetworks.find(n => n === network)) {
    return svm.createSvmConnectedClient(network);
  }

  if (isAptosNetwork(network)) {
    return aptos.createAptosConnectedClient(network);
  }

  throw new Error(`Unsupported network: ${network}`);
}

/**
 * Creates a wallet client configured for the specified chain with a private key.
 *
 * @param network - The network to connect to.
 * @param privateKey - The private key to use for signing transactions. This should be a hex string for EVM/Aptos or a base58 encoded string for SVM.
 * @returns A wallet client instance connected to the specified chain with the provided private key.
 */
export function createSigner(network: string, privateKey: Hex | string): Promise<Signer> {
  // evm
  if (SupportedEVMNetworks.find(n => n === network)) {
    return Promise.resolve(evm.createSigner(network, privateKey as Hex));
  }

  // svm
  if (SupportedSVMNetworks.find(n => n === network)) {
    return svm.createSignerFromBase58(privateKey as string);
  }

  // aptos
  if (isAptosNetwork(network)) {
    return aptos.createSignerFromPrivateKey(privateKey);
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
  return svm.isSignerWallet(wallet);
}

/**
 * Checks if the given wallet is an Aptos signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is an Aptos signer wallet, false otherwise
 */
export function isAptosSignerWallet(wallet: Signer): wallet is aptos.AptosSigner {
  return aptos.isAptosSigner(wallet);
}

/**
 * Checks if the given wallet is an Aptos multi signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is an Aptos signer wallet, false otherwise*
 */
export function isMultiNetworkSupportingAptos(wallet: object): wallet is AptosMultiNetworkSigner {
  return "aptos" in wallet;
}

/**
 * Checks if the given wallet is a multi network signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is a multi network signer wallet, false otherwise
 */
export function isMultiNetworkSigner(wallet: object): wallet is MultiNetworkSigner {
  return "evm" in wallet && "svm" in wallet && "aptos" in wallet;
}
