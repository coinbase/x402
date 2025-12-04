import { rpc } from "@stellar/stellar-sdk";
import { Network, StellarNetworkToPassphrase } from "../../types/shared";
import { X402Config } from "../../types/config";

export type StellarConnectedClient = rpc.Server;

/**
 * Default Soroban RPC endpoint for Stellar testnet
 */
const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";

/**
 * Gets the network passphrase for a given network.
 *
 * @param network - The network to get the passphrase for
 * @returns The network passphrase
 * @throws Error if the network is unknown
 */
export function getNetworkPassphrase(network: Network): string {
  const networkPassphrase = StellarNetworkToPassphrase.get(network);
  if (!networkPassphrase) {
    throw new Error(`Unknown Stellar network: ${network}`);
  }
  return networkPassphrase;
}

/**
 * Gets the RPC URL for a given network.
 *
 * @param network - The network to get the RPC URL for
 * @param config - Optional X402 configuration with custom RPC URL
 * @returns The RPC URL for the given network
 * @throws Error if the network is unknown or the RPC URL is not provided for mainnet
 */
export function getRpcUrl(network: Network, config?: X402Config): string {
  const customRpcUrl = config?.stellarConfig?.rpcUrl;
  switch (network) {
    case "stellar-testnet":
      return customRpcUrl || TESTNET_RPC_URL;
    case "stellar":
      if (!customRpcUrl) {
        throw new Error(
          "Stellar mainnet requires a non-empty rpcUrl. For a list of RPC providers, see https://developers.stellar.org/docs/data/apis/rpc/providers#publicly-accessible-apis",
        );
      }
      return customRpcUrl;
    default:
      throw new Error(`Unknown Stellar network: ${network}`);
  }
}

/**
 * Gets the Soroban RPC client for the given network.
 *
 * @param network - The network to get the RPC client for
 * @param config - Optional X402 configuration with custom RPC URL
 * @returns The Soroban RPC Server instance for the given network
 * @throws Error if the network is not a valid Stellar network
 */
export function getRpcClient(network: Network, config?: X402Config): rpc.Server {
  const rpcUrl = getRpcUrl(network, config);
  return new rpc.Server(rpcUrl, {
    allowHttp: network === "stellar-testnet", // Allow HTTP for testnet
  });
}
