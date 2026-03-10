import { Buffer } from "buffer";
import { AlgodClient } from "@algorandfoundation/algokit-utils/algod-client";
import { encodeAddress } from "@algorandfoundation/algokit-utils/common";
import { ed25519Generator } from "@algorandfoundation/algokit-utils/crypto";
import {
  decodeTransaction as decodeUnsignedTransaction,
  bytesForSigning,
  encodeSignedTransaction,
} from "@algorandfoundation/algokit-utils/transact";

import { SupportedAVMNetworks, Network } from "../../types/shared";
import { AlgorandClient, WalletAccount } from "../../schemes/exact/avm/types";

const DEFAULT_ALGOD_ENDPOINTS = {
  "algorand-mainnet": "https://mainnet-api.algonode.cloud",
  "algorand-testnet": "https://testnet-api.algonode.cloud",
} as const;

type SupportedAvmNetwork = keyof typeof DEFAULT_ALGOD_ENDPOINTS;

export interface AlgodClientOptions {
  /** Custom algod endpoint */
  algodServer?: string;
  /** API token for the algod endpoint */
  algodToken?: string;
  /** Optional port, defaults to empty string so the SDK picks protocol default */
  algodPort?: number | string;
}

/**
 * AVM (Algorand) signer interface
 */
export interface AvmSigner {
  address: string;
  signTransactions(txns: Uint8Array[], indexesToSign?: number[]): Promise<(Uint8Array | null)[]>;
}

/**
 * Type guard to check if a wallet is an AVM signer
 *
 * @param wallet - The value to check
 * @returns True if the wallet implements the AvmSigner interface
 */
export function isSignerWallet(wallet: unknown): wallet is AvmSigner {
  return (
    typeof wallet === "object" &&
    wallet !== null &&
    "address" in wallet &&
    typeof (wallet as AvmSigner).address === "string" &&
    "signTransactions" in wallet &&
    typeof (wallet as AvmSigner).signTransactions === "function"
  );
}

/**
 * Asserts that the provided network is a supported Algorand network.
 *
 * @param network - The network to check
 * @throws Error if the network is not a supported Algorand network
 */
function assertAvmNetwork(network: Network): asserts network is SupportedAvmNetwork {
  if (!SupportedAVMNetworks.includes(network)) {
    throw new Error(`Unsupported Algorand network: ${network}`);
  }
}

/**
 * Creates an Algorand client instance for the specified network.
 *
 * @param network - The Algorand network to connect to
 * @param options - Optional configuration for the Algorand client
 * @returns An AlgodClient instance configured for the specified network
 */
function resolveAlgodClient(network: SupportedAvmNetwork, options?: AlgodClientOptions): AlgodClient {
  const server = options?.algodServer ?? DEFAULT_ALGOD_ENDPOINTS[network];
  if (!server) {
    throw new Error(`No algod endpoint configured for network: ${network}`);
  }

  const token = options?.algodToken ?? "";

  return new AlgodClient({ baseUrl: server, token: token || undefined });
}

/**
 * Derives an Algorand account from a hex-encoded secret key.
 *
 * @param secret - The secret key as a hex string (with or without 0x prefix)
 * @returns The derived Algorand account with address, seed, and signing function
 */
function deriveAccount(secret: string) {
  const trimmed = secret.trim();
  const normalized = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  const secretKey = new Uint8Array(Buffer.from(normalized, "hex"));
  const seed = secretKey.slice(0, 32);

  const { ed25519Pubkey, rawEd25519Signer } = ed25519Generator(seed);
  const address = encodeAddress(ed25519Pubkey);

  return { addr: address, seed, ed25519Pubkey, rawEd25519Signer };
}

/**
 * Creates an Algorand client for the specified network.
 *
 * @param network - The Algorand network to connect to
 * @param options - Optional configuration for the Algorand client
 * @returns An AlgorandClient object containing the client and network information
 */
export function createAlgorandClient(
  network: Network,
  options?: AlgodClientOptions,
): AlgorandClient {
  assertAvmNetwork(network);
  const client = resolveAlgodClient(network, options);
  return {
    client,
    network,
  };
}

/**
 * Creates a wallet account that can sign Algorand transactions.
 *
 * @param network - The Algorand network to connect to
 * @param secret - The secret key (hex string) or mnemonic phrase for the account
 * @param options - Optional configuration for the Algorand client
 * @returns A WalletAccount object that can sign transactions
 */
export function createSigner(
  network: Network,
  secret: string,
  options?: AlgodClientOptions,
): WalletAccount {
  const algorandClient = createAlgorandClient(network, options);
  const account = deriveAccount(secret);
  const address = String(account.addr);

  return {
    address,
    client: algorandClient.client,
    async signTransactions(transactions: Uint8Array[], indexesToSign?: number[]) {
      return Promise.all(
        transactions.map(async (txnBytes, idx) => {
          if (indexesToSign && !indexesToSign.includes(idx)) {
            return null;
          }
          const txn = decodeUnsignedTransaction(txnBytes);
          const msg = bytesForSigning.transaction(txn);
          const sig = await account.rawEd25519Signer(msg);
          return encodeSignedTransaction({ txn, sig });
        }),
      );
    },
  };
}

/**
 * Creates an AVM signer from account derivation data
 *
 * @param account - The derived account containing address and signing function
 * @returns An AvmSigner that signs transactions using the account's signing function
 */
function createSignerFromDerivedAccount(account: {
  addr: string;
  rawEd25519Signer: (msg: Uint8Array) => Promise<Uint8Array>;
}): AvmSigner {
  return {
    address: account.addr,
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]) {
      const indexes = indexesToSign ?? txns.map((_, i) => i);
      const signed: (Uint8Array | null)[] = [];

      for (let i = 0; i < txns.length; i++) {
        if (indexes.includes(i)) {
          const decodedTxn = decodeUnsignedTransaction(txns[i]);
          const msg = bytesForSigning.transaction(decodedTxn);
          const sig = await account.rawEd25519Signer(msg);
          signed.push(encodeSignedTransaction({ txn: decodedTxn, sig }));
        } else {
          signed.push(null);
        }
      }

      return signed;
    },
  };
}

/**
 * Creates an AVM signer from seed bytes and public key
 *
 * @param seed - The 32-byte ed25519 seed
 * @returns An AvmSigner that signs transactions using the seed-derived key
 */
export function createSignerFromSeed(seed: Uint8Array): AvmSigner {
  const { ed25519Pubkey, rawEd25519Signer } = ed25519Generator(seed);
  const address = encodeAddress(ed25519Pubkey);
  return createSignerFromDerivedAccount({ addr: address, rawEd25519Signer });
}
