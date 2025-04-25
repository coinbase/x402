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
} from "viem";
import { baseSepolia } from "viem/chains";
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

/**
 * Creates a public client configured for the Base Sepolia testnet
 *
 * @returns A public client instance connected to Base Sepolia
 */
export function createClientSepolia(): ConnectedClient<Transport, typeof baseSepolia, undefined> {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(),
  }).extend(publicActions);
}

/**
 * Creates a wallet client configured for the Base Sepolia testnet with a private key
 *
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to Base Sepolia with the provided private key
 */
export function createSignerSepolia(privateKey: Hex): SignerWallet<typeof baseSepolia> {
  return createWalletClient({
    chain: baseSepolia,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);
}
