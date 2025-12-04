import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner, SignAuthEntry, SignTransaction } from "@stellar/stellar-sdk/contract";
import { getNetworkPassphrase } from "./rpc";
import { Network } from "../../types";

export type Ed25519Signer = {
  address: string;
  signAuthEntry: SignAuthEntry;
  signTransaction: SignTransaction;
};

/**
 * Creates a Stellar signer for the given network.
 *
 * @param privateKey - The private key of a Stellar classic (G) account to use for signing transactions
 * @param network - The network to use for signing transactions
 * @returns A Stellar signer
 */
export function createStellarSigner(privateKey: string, network: Network): Ed25519Signer {
  const kp = Keypair.fromSecret(privateKey);
  const { signAuthEntry, signTransaction } = basicNodeSigner(kp, getNetworkPassphrase(network));
  return { address: kp.publicKey(), signAuthEntry, signTransaction };
}

/**
 * Checks if the given value is a StellarContractSigner.
 *
 * @param signer - The value to check
 * @returns True if the value is a StellarContractSigner
 */
export function isStellarSigner(signer: unknown): signer is Ed25519Signer {
  if (typeof signer !== "object" || signer === null) {
    return false;
  }

  const s = signer as Record<string, unknown>;

  return (
    typeof s.address === "string" &&
    typeof s.signAuthEntry === "function" &&
    typeof s.signTransaction === "function"
  );
}
