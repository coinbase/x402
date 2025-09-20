import { createPublicClient, createWalletClient, http, publicActions } from "viem";
import type {
  Chain,
  Transport,
  Client,
  Account,
  RpcSchema,
  PublicActions,
  WalletActions,
  PublicClient,
  LocalAccount,
} from "viem";
import { baseSepolia, avalancheFuji, base, sei, seiTestnet, peaq } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Hex } from "viem";

// Create a public client for reading data
export type SignerWallet<
  chain extends Chain = Chain,
  transport extends Transport = Transport,
  account extends Account = Account,
> = Client<
  transport,
  chain,
  account,
  RpcSchema,
  PublicActions<transport, chain, account> & WalletActions<chain, account>
>;

export type ConnectedClient<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain,
  account extends Account | undefined = undefined,
> = PublicClient<transport, chain, account>;

export type EvmSigner = SignerWallet<Chain, Transport, Account> | LocalAccount;

/**
 * Creates a public client configured for the specified network
 *
 * @param network - The network to connect to
 * @returns A public client instance connected to the specified chain
 */
export function createConnectedClient(
  network: string,
): ConnectedClient<Transport, Chain, undefined> {
  const chain = getChainFromNetwork(network);
  return createPublicClient({
    chain,
    transport: http(),
  }).extend(publicActions);
}

/**
 * Creates a wallet client configured for the specified chain with a private key
 *
 * @param network - The network to connect to
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to the specified chain with the provided private key
 */
export function createSigner(network: string, privateKey: Hex): SignerWallet<Chain> {
  const chain = getChainFromNetwork(network);
  return createWalletClient({
    chain,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);
}

// Back-compat helpers (deprecated)
export function createClientSepolia(): ConnectedClient<Transport, typeof baseSepolia, undefined> {
  return createConnectedClient("base-sepolia") as ConnectedClient<Transport, typeof baseSepolia, undefined>;
}
export function createClientAvalancheFuji(): ConnectedClient<Transport, typeof avalancheFuji, undefined> {
  return createConnectedClient("avalanche-fuji") as ConnectedClient<Transport, typeof avalancheFuji, undefined>;
}
export function createSignerSepolia(privateKey: Hex): SignerWallet<typeof baseSepolia> {
  return createSigner("base-sepolia", privateKey) as SignerWallet<typeof baseSepolia>;
}
export function createSignerAvalancheFuji(privateKey: Hex): SignerWallet<typeof avalancheFuji> {
  return createSigner("avalanche-fuji", privateKey) as SignerWallet<typeof avalancheFuji>;
}

export function getChainFromNetwork(network: string | undefined): Chain {
  if (!network) throw new Error("NETWORK environment variable is not set");
  switch (network) {
    case "base":
      return base;
    case "base-sepolia":
      return baseSepolia;
    case "avalanche-fuji":
      return avalancheFuji;
    case "sei":
      return sei;
    case "sei-testnet":
      return seiTestnet;
    case "peaq":
      return peaq;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}
