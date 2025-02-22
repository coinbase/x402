import {
  createPublicClient,
  createWalletClient,
  http,
  publicActions,
} from "viem";
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
  chain extends Chain | undefined = Chain,
  transport extends Transport = Transport,
  account extends Account | undefined = Account
> = Client<
  transport,
  chain,
  account,
  RpcSchema,
  PublicActions<transport, chain, account> & WalletActions<chain, account>
>;

export type ConnectedClient<
  transport extends Transport = Transport,
  chain extends Chain = Chain
> = Client<
  transport,
  chain,
  Account,
  RpcSchema,
  PublicActions<transport, chain>
>;

export const testClient: ConnectedClient<Transport, typeof baseSepolia> =
  createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

export const botWallet: SignerWallet<typeof baseSepolia> = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

export const facilitatorWallet: SignerWallet<typeof baseSepolia> =
  createWalletClient({
    chain: baseSepolia,
    transport: http(),
    account: privateKeyToAccount(
      process.env.FACILITATOR_WALLET_PRIVATE_KEY as Hex
    ),
  }).extend(publicActions);
