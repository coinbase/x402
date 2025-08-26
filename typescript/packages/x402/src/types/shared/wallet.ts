import * as evm from "./evm/wallet";
import * as svm from "../../shared/svm/wallet";
import * as starknet from "../../shared/starknet/wallet";
import { SupportedEVMNetworks, SupportedSVMNetworks, SupportedStarknetNetworks } from "./network";
import { Hex } from "viem";

export type ConnectedClient = evm.ConnectedClient | svm.SvmConnectedClient | starknet.StarknetConnectedClient;
export type Signer = evm.EvmSigner | svm.SvmSigner | starknet.StarknetSigner;
export type MultiNetworkSigner = { 
  evm: evm.EvmSigner; 
  svm: svm.SvmSigner; 
  starknet: starknet.StarknetSigner; 
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

  if (SupportedStarknetNetworks.find(n => n === network)) {
    return starknet.createStarknetConnectedClient(network);
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
export function createSigner(network: string, privateKey: Hex | string): Promise<Signer> {
  // evm
  if (SupportedEVMNetworks.find(n => n === network)) {
    return Promise.resolve(evm.createSigner(network, privateKey as Hex));
  }

  // svm
  if (SupportedSVMNetworks.find(n => n === network)) {
    return svm.createSignerFromBase58(privateKey as string);
  }

  // starknet
  if (SupportedStarknetNetworks.find(n => n === network)) {
    return starknet.createStarknetSigner(network, privateKey as string);
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
  return evm.isSignerWallet(wallet as evm.EvmSigner);
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
 * Checks if the given wallet is a Starknet signer wallet.
 *
 * @param wallet - The object wallet to check.
 * @returns True if the wallet is a Starknet signer wallet, false otherwise.
 */
export function isStarknetSignerWallet(wallet: Signer): wallet is starknet.StarknetSigner {
  return starknet.isStarknetSigner(wallet as starknet.StarknetSigner);
}

/**
 * Checks if the given wallet is a multi network signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is a multi network signer wallet, false otherwise
 */
export function isMultiNetworkSigner(wallet: object): wallet is MultiNetworkSigner {
  return "evm" in wallet && "svm" in wallet && "starknet" in wallet;
}
