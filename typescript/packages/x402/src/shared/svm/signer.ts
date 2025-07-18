import {
  createKeyPairSignerFromBytes,
  KeyPairSigner,
  createKeyPairSignerFromPrivateKeyBytes,
} from "@solana/kit";
import bs58 from "bs58";

/**
 * Creates a Solana signer from a private key.
 *
 * @param privateKey - The base58 encoded private key to create a signer from.
 * @returns A Solana signer.
 */
export async function createSignerFromBase58(privateKey: string): Promise<KeyPairSigner> {
  // decode the base58 encoded private key
  const bytes = bs58.decode(privateKey);

  // generate a keypair signer from the bytes based on the byte-length
  // 64 bytes represents concatenated private + public key
  if (bytes.length === 64) {
    return await createKeyPairSignerFromBytes(bytes);
  }
  // 32 bytes represents only the private key
  if (bytes.length === 32) {
    return await createKeyPairSignerFromPrivateKeyBytes(bytes);
  }
  throw new Error(`Unexpected key length: ${bytes.length}. Expected 32 or 64 bytes.`);
}
