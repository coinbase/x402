import { SuiClient } from "@mysten/sui/client";
import { decodeSuiPrivateKey, Signer } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Network } from "../..";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { Transaction } from "@mysten/sui/transactions";

export type SuiSigner = Signer;

/**
 * Creates a Sui signer from a private key.
 *
 * @param secret - The bech32 encoded private key to create a signer from.
 * @returns A Sui signer.
 */
export async function createSigner(secret: string): Promise<SuiSigner> {
  const { scheme, secretKey } = decodeSuiPrivateKey(secret);

  switch (scheme) {
    case "ED25519":
      return Ed25519Keypair.fromSecretKey(secretKey);
    case "Secp256k1":
      return Secp256k1Keypair.fromSecretKey(secretKey);
    case "Secp256r1":
      return Secp256r1Keypair.fromSecretKey(secretKey);
    default:
      throw new Error(`Unsupported scheme: ${scheme}`);
  }
}

/**
 * Checks if the given object is a Sui signer.
 *
 * @param wallet - The object to check.
 * @returns True if the object is a Sui signer, false otherwise
 */
export function isSuiSigner(wallet: unknown): wallet is SuiSigner {
  return (
    typeof wallet === "object" &&
    wallet !== null &&
    "signAndExecuteTransaction" in wallet &&
    "toSuiAddress" in wallet
  );
}

export type { SuiClient };

/**
 * Creates a Sui client configured for the specified network.
 *
 * @param network - The network to connect to.
 * @param rpcUrl - The RPC URL to use
 * @returns A Sui client instance connected to the specified network.
 */
export function createClient(network: Network, rpcUrl: string): SuiClient {
  let suiNetwork: "mainnet" | "testnet";

  switch (network) {
    case "sui-testnet":
      suiNetwork = "testnet";
      break;
    case "sui":
      suiNetwork = "mainnet";
      break;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }

  return new SuiClient({
    url: rpcUrl,
    network: suiNetwork,
  });
}

/**
 * A class for building and signing Sui transactions.
 */
export class SuiWallet {
  address: string;
  network: Network;
  signTransaction: (transaction: Transaction) => Promise<{ signature: string; bytes: string }>;

  /**
   * Creates a SuiSigner.
   *
   * @param address - The address of the wallet
   * @param network - The network this wallet is on
   * @param signTransaction - Function to build and sign a transaction
   * @returns A SuiSigner.
   */
  constructor(
    address: string,
    network: Network,
    signTransaction: (transaction: Transaction) => Promise<{ signature: string; bytes: string }>,
  ) {
    this.address = address;
    this.network = network;
    this.signTransaction = signTransaction;
  }

  /**
   * Creates a SuiSigner from a keypair and a Sui client.
   *
   * @param keypair - The keypair or signer used for signing
   * @param client - The Sui client to use to build transactions
   * @param network - The network this wallet is on
   * @returns A SuiSigner.
   */
  static fromSigner(keypair: Signer, client: SuiClient, network: Network) {
    return new SuiWallet(keypair.toSuiAddress(), network, async transaction =>
      keypair.signTransaction(await transaction.build({ client })),
    );
  }
}
