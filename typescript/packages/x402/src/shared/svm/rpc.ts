import bs58 from "bs58";
import {
  createSolanaRpc,
  devnet,
  KeyPairSigner,
  mainnet,
  RpcDevnet,
  SolanaRpcApiDevnet,
  SolanaRpcApiMainnet,
  RpcMainnet,
  createKeyPairSignerFromPrivateKeyBytes,
  createKeyPairSignerFromBytes,
} from "@solana/kit";

/**
 * Creates a Solana RPC client for the devnet network.
 *
 * @param url - Optional URL of the devnet network.
 * @returns A Solana RPC client.
 */
export function createDevnetRpcClient(url?: string): RpcDevnet<SolanaRpcApiDevnet> {
  return createSolanaRpc(url ? devnet(url) : devnet("devnet")) as RpcDevnet<SolanaRpcApiDevnet>;
}

/**
 * Creates a Solana RPC client for the mainnet network.
 *
 * @param url - Optional URL of the mainnet network.
 * @returns A Solana RPC client.
 */
export function createMainnetRpcClient(url?: string): RpcMainnet<SolanaRpcApiMainnet> {
  return createSolanaRpc(
    url ? mainnet(url) : mainnet("mainnet"),
  ) as RpcMainnet<SolanaRpcApiMainnet>;
}

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
