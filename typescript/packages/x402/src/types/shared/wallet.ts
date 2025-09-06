import * as evm from "./evm/wallet";
import * as svm from "../../shared/svm/wallet";
import * as hedera from "../../shared/hedera/wallet";
import { SupportedEVMNetworks, SupportedSVMNetworks, SupportedHederaNetworks } from "./network";
import { Hex } from "viem";

export type ConnectedClient = evm.ConnectedClient | svm.SvmConnectedClient | hedera.HederaConnectedClient;
export type Signer = evm.EvmSigner | svm.SvmSigner | hedera.HederaSigner;
export type MultiNetworkSigner = { evm: evm.EvmSigner; svm: svm.SvmSigner; hedera: hedera.HederaSigner };

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

  if (SupportedHederaNetworks.find(n => n === network)) {
    return hedera.createHederaConnectedClient(network);
  }

  throw new Error(`Unsupported network: ${network}`);
}

/**
 * Creates a wallet client configured for the specified chain with a private key.
 *
 * @param network - The network to connect to.
 * @param privateKey - The private key to use for signing transactions. For Hedera networks, use format "privateKey|accountId"
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

  // hedera
  if (SupportedHederaNetworks.find(n => n === network)) {
    const privateKeyStr = privateKey as string;
    const [hederaPrivateKey, accountId] = privateKeyStr.split('|');
    if (!hederaPrivateKey || !accountId) {
      throw new Error('Hedera signer requires privateKey|accountId format');
    }
    return Promise.resolve(hedera.createHederaSigner(network, hederaPrivateKey, accountId));
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
 * Checks if the given wallet is a Hedera signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is a Hedera signer wallet, false otherwise
 */
export function isHederaSignerWallet(wallet: Signer): wallet is hedera.HederaSigner {
  return hedera.isHederaSigner(wallet as hedera.HederaSigner);
}

/**
 * Checks if the given wallet is a multi network signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is a multi network signer wallet, false otherwise
 */
export function isMultiNetworkSigner(wallet: object): wallet is MultiNetworkSigner {
  return "evm" in wallet && "svm" in wallet && "hedera" in wallet;
}
