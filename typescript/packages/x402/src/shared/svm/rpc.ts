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
import { Network } from "../../types/shared";

/**
 * Default public RPC endpoint for Solana devnet
 */
const DEVNET_RPC_URL = "https://api.devnet.solana.com";

/**
 * Default public RPC endpoint for Solana mainnet
 */
const MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

/**
 * Default public WebSocket endpoint for Solana devnet
 */
const DEVNET_WS_URL = "wss://api.devnet.solana.com";

/**
 * Default public WebSocket endpoint for Solana mainnet
 */
const MAINNET_WS_URL = "wss://api.mainnet-beta.solana.com";

/**
 * Default localhost URL for Solana RPC
 */
const LOCALHOST_URL = "http://127.0.0.1:8899";

/**
 * Default localhost WS URL for Solana WebSocket
 */
const LOCALHOST_WS_URL = "ws://127.0.0.1:8900";

/**
 * Gets the RPC client for the given network.
 *
 * @param network - The network to get the RPC client for
 * @param url - Optional URL of the network. If not provided, the default URL will be used.
 * @returns The RPC client for the given network
 */
export function getRpcClient(
  network: Network,
  url?: string,
): RpcDevnet<SolanaRpcApiDevnet> | RpcMainnet<SolanaRpcApiMainnet> {
  validateNetwork(network);
  const clusterFunction = getClusterFunction(network);
  const rpcUrl = url ? url : getPublicRpcUrl(network);
  return createSolanaRpc(clusterFunction(rpcUrl)) as
    | RpcDevnet<SolanaRpcApiDevnet>
    | RpcMainnet<SolanaRpcApiMainnet>;
}

/**
 * Gets the RPC subscriptions for the given network.
 *
 * @param network - The network to get the RPC subscriptions for
 * @param url - Optional RPC URL. If provided and no subscriptionsUrl is given, will be converted to WebSocket URL.
 * @param subscriptionsUrl - Optional custom WebSocket URL for subscriptions. Takes precedence over url parameter.
 * @returns The RPC subscriptions for the given network
 */
export function getRpcSubscriptions(
  network: Network,
  url?: string,
  subscriptionsUrl?: string,
): RpcSubscriptionsFromTransport<
  SolanaRpcSubscriptionsApi,
  RpcSubscriptionsTransportFromClusterUrl<ClusterUrl>
> {
  validateNetwork(network);
  const wsUrl = subscriptionsUrl ? subscriptionsUrl : url ? httpToWs(url) : getPublicWsUrl(network);
  const clusterFunction = getClusterFunction(network);
  return createSolanaRpcSubscriptions(clusterFunction(wsUrl));
}

/**
 *
 * Converts an HTTP URL to a WebSocket URL
 *
 * @param url - The URL to convert to a WebSocket URL
 * @returns The WebSocket URL
 */
function httpToWs(url: string): string {
  if (url === LOCALHOST_URL) {
    return LOCALHOST_WS_URL;
  }
  if (url.startsWith("http")) {
    console.warn(`No WS URL provided, converting HTTP URL ${url} to WebSocket URL`);
    return url.replace("http", "ws");
  }
  return url;
}

/**
 *
 * Gets the public WebSocket URL for the given network.
 *
 * @param network - The network to get the public WebSocket URL for
 * @returns The public WebSocket URL for the given network
 */
function getPublicWsUrl(network: Network): string {
  if (network === "solana-devnet") {
    return DEVNET_WS_URL;
  } else if (network === "solana") {
    return MAINNET_WS_URL;
  } else {
    throw new Error("Invalid Solana network");
  }
}

/**
 *
 * Gets the public RPC URL for the given network.
 *
 * @param network - The network to get the public RPC URL for
 * @returns The public RPC URL for the given network
 */
function getPublicRpcUrl(network: Network): string {
  if (network === "solana-devnet") {
    return DEVNET_RPC_URL;
  } else if (network === "solana") {
    return MAINNET_RPC_URL;
  } else {
    throw new Error("Invalid Solana network");
  }
}

/**
 *
 * Validates the given network.
 *
 * @param network - The network to get the cluster function for
 * @returns The cluster function for the given network
 */
function getClusterFunction(network: Network): (url: string) => ClusterUrl {
  if (network === "solana-devnet") {
    return devnet;
  } else if (network === "solana") {
    return mainnet;
  } else {
    throw new Error("Invalid Solana network");
  }
}

/**
 *
 * Verifies the given network is a valid Solana network. Throws an error if not.
 *
 * @param network - The network to validate
 */
function validateNetwork(network: Network): void {
  // TODO: should the networks be replaced with enum references?
  if (network !== "solana-devnet" && network !== "solana") {
    throw new Error("Invalid Solana network");
  }
}
