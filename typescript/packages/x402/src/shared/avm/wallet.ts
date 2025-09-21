import { Buffer } from "buffer";
import algosdk, { Algodv2 } from "algosdk";

import { SupportedAVMNetworks, Network } from "../../types/shared";
import { AlgorandClient, WalletAccount } from "../../schemes/exact/avm/types";

const DEFAULT_ALGOD_ENDPOINTS = {
  algorand: "https://mainnet-api.algonode.cloud",
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

function assertAvmNetwork(network: Network): asserts network is SupportedAvmNetwork {
  if (!SupportedAVMNetworks.includes(network)) {
    throw new Error(`Unsupported Algorand network: ${network}`);
  }
}

function resolveAlgodClient(
  network: SupportedAvmNetwork,
  options?: AlgodClientOptions,
): Algodv2 {
  const server = options?.algodServer ?? DEFAULT_ALGOD_ENDPOINTS[network];
  if (!server) {
    throw new Error(`No algod endpoint configured for network: ${network}`);
  }

  const token = options?.algodToken ?? "";
  const port = options?.algodPort ?? "";

  return new algosdk.Algodv2(token, server, port);
}

function deriveAccount(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.split(/\s+/).length === 25) {
    return algosdk.mnemonicToSecretKey(trimmed);
  }

  const normalized = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  const secretKey = new Uint8Array(Buffer.from(normalized, "hex"));
  const mnemonic = algosdk.secretKeyToMnemonic(secretKey);
  return algosdk.mnemonicToSecretKey(mnemonic);
}

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
    async signTransactions(transactions: Uint8Array[]) {
      return transactions.map(txnBytes => {
        const txn = algosdk.decodeUnsignedTransaction(txnBytes);
        const { blob } = algosdk.signTransaction(txn, account.sk);
        return blob;
      });
    },
  };
}
