import {
  createSolanaRpc,
  devnet,
  mainnet,
  RpcDevnet,
  SolanaRpcApiDevnet,
  SolanaRpcApiMainnet,
  RpcMainnet,
  createSolanaRpcSubscriptions,
  RpcSubscriptionsFromTransport,
  SolanaRpcSubscriptionsApi,
  RpcSubscriptionsTransportFromClusterUrl,
  ClusterUrl,
} from "@solana/kit";
import { NetworkEnum } from "../../types";

/**
 * Creates a Solana RPC client for the devnet network.
 *
 * @param url - Optional URL of the devnet network.
 * @returns A Solana RPC client.
 */
export function createDevnetRpcClient(url?: string): RpcDevnet<SolanaRpcApiDevnet> {
  return createSolanaRpc(
    url ? devnet(url) : devnet("https://api.devnet.solana.com"),
  ) as RpcDevnet<SolanaRpcApiDevnet>;
}

/**
 * Creates a Solana RPC client for the mainnet network.
 *
 * @param url - Optional URL of the mainnet network.
 * @returns A Solana RPC client.
 */
export function createMainnetRpcClient(url?: string): RpcMainnet<SolanaRpcApiMainnet> {
  return createSolanaRpc(
    url ? mainnet(url) : mainnet("https://api.mainnet-beta.solana.com"),
  ) as RpcMainnet<SolanaRpcApiMainnet>;
}

/**
 * Gets the RPC client for the given network.
 *
 * @param network - The network to get the RPC client for
 * @param url - Optional URL of the network. If not provided, the default URL will be used.
 * @returns The RPC client for the given network
 */
export function getRpcClient(
  network: NetworkEnum,
  url?: string,
): RpcDevnet<SolanaRpcApiDevnet> | RpcMainnet<SolanaRpcApiMainnet> {
  if (network === NetworkEnum.SOLANA_DEVNET) {
    return createDevnetRpcClient(url);
  } else if (network === NetworkEnum.SOLANA_MAINNET) {
    return createMainnetRpcClient(url);
  } else {
    throw new Error("Invalid network");
  }
}

/**
 * Gets the RPC subscriptions for the given network.
 *
 * @param network - The network to get the RPC subscriptions for
 * @param url - Optional URL of the network. If not provided, the default URL will be used.
 * @returns The RPC subscriptions for the given network
 */
export function getRpcSubscriptions(
  network: NetworkEnum,
  url?: string,
): RpcSubscriptionsFromTransport<SolanaRpcSubscriptionsApi, RpcSubscriptionsTransportFromClusterUrl<ClusterUrl>> {
  if (network === NetworkEnum.SOLANA_DEVNET) {
    return createSolanaRpcSubscriptions(devnet(url ?? "wss://api.devnet.solana.com"));
  } else if (network === NetworkEnum.SOLANA_MAINNET) {
    return createSolanaRpcSubscriptions(mainnet(url ?? "wss://api.mainnet-beta.solana.com"));
  } else {
    throw new Error("Invalid network");
  }
}