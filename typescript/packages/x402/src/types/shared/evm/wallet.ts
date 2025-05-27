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
import { baseSepolia, avalancheFuji, arbitrum, arbitrumSepolia } from "viem/chains";
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
 * Creates a public client configured for the Avalanche Fuji testnet
 *
 * @returns A public client instance connected to Avalanche Fuji
 */
export function createClientAvalancheFuji(): ConnectedClient<
  Transport,
  typeof avalancheFuji,
  undefined
> {
  return createPublicClient({
    chain: avalancheFuji,
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

/**
 * Creates a wallet client configured for the Avalanche Fuji testnet with a private key
 *
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to Avalanche Fuji with the provided private key
 */
export function createSignerAvalancheFuji(privateKey: Hex): SignerWallet<typeof avalancheFuji> {
  return createWalletClient({
    chain: avalancheFuji,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);
}

/**
 * Creates a public client configured for the Arbitrum One mainnet
 *
 * @returns A public client instance connected to Arbitrum One
 */
export function createClientArbitrumOne(): ConnectedClient<Transport, typeof arbitrum, undefined> {
  return createPublicClient({
    chain: arbitrum,
    transport: http(),
  }).extend(publicActions);
}

/**
 * Creates a public client configured for the Arbitrum Sepolia testnet
 *
 * @returns A public client instance connected to Arbitrum Sepolia
 */
export function createClientArbitrumSepolia(): ConnectedClient<
  Transport,
  typeof arbitrumSepolia,
  undefined
> {
  return createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  }).extend(publicActions);
}

/**
 * Creates a wallet client configured for the Arbitrum One mainnet with a private key
 *
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to Arbitrum One with the provided private key
 */
export function createSignerArbitrumOne(privateKey: Hex): SignerWallet<typeof arbitrum> {
  return createWalletClient({
    chain: arbitrum,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);
}

/**
 * Creates a wallet client configured for the Arbitrum Sepolia testnet with a private key
 *
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to Arbitrum Sepolia with the provided private key
 */
export function createSignerArbitrumSepolia(privateKey: Hex): SignerWallet<typeof arbitrumSepolia> {
  return createWalletClient({
    chain: arbitrumSepolia,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);
}

/**
 * Checks if a wallet is a signer wallet
 *
 * @param wallet - The wallet to check
 * @returns True if the wallet is a signer wallet, false otherwise
 */
export function isSignerWallet<
  TChain extends Chain = Chain,
  TTransport extends Transport = Transport,
  TAccount extends Account = Account,
>(
  wallet: SignerWallet<TChain, TTransport, TAccount> | Account,
): wallet is SignerWallet<TChain, TTransport, TAccount> {
  return "chain" in wallet && "transport" in wallet;
}

/**
 * Checks if a wallet is an account
 *
 * @param wallet - The wallet to check
 * @returns True if the wallet is an account, false otherwise
 */
export function isAccount(wallet: SignerWallet | Account): wallet is Account {
  return "address" in wallet && "type" in wallet;
}
