/**
 * Aptos wallet and signer utilities for x402 protocol
 *
 * This module provides types and helper functions for working with Aptos accounts
 * in the x402 payment protocol.
 */

import {
  Account,
  Ed25519PrivateKey,
  Network as AptosNetwork,
  NetworkToNodeAPI,
} from "@aptos-labs/ts-sdk";
import { Network } from "../../types/shared/network";
import { Signer } from "../../types";

/**
 * Type alias for Aptos signer
 */
export type AptosSigner = Account;

/**
 * Type guard to check if an object is an Aptos signer
 *
 * @param obj - The object to check
 * @returns True if the object is an Aptos signer
 */
export function isAptosSigner(obj: Signer): obj is AptosSigner {
  // Must have a function named `.accountAddress()` and a function named `.signTransaction()`
  return (
    obj &&
    typeof obj === "object" &&
    "accountAddress" in obj &&
    typeof obj.accountAddress === "object" &&
    typeof obj.accountAddress.toString === "function" &&
    "signTransaction" in obj &&
    typeof obj.signTransaction === "function"
  );
}

/**
 * Creates an Aptos signer from a private key
 *
 * @param privateKey - The private key as a hex string (with or without 0x prefix)
 * @returns An Aptos signer instance
 */
export async function createSignerFromPrivateKey(privateKey: string): Promise<AptosSigner> {
  // Create Ed25519 private key from hex string
  const privateKeyBytes = new Ed25519PrivateKey(privateKey);

  // Create and return Account
  return Account.fromPrivateKey({ privateKey: privateKeyBytes });
}

/**
 * Gets the Aptos network identifier for the given v2 CAIP-2 network format
 *
 * @param network - The v2 CAIP-2 network identifier (aptos:1 or aptos:2)
 * @returns The Aptos network identifier
 */
export function getAptosNetwork(network: Network): AptosNetwork {
  switch (network) {
    case "aptos:1":
      return AptosNetwork.MAINNET;
    case "aptos:2":
      return AptosNetwork.TESTNET;
    default:
      throw new Error(`Unsupported Aptos network: ${network}`);
  }
}

/**
 * Gets the Aptos RPC URL for the given network
 *
 * @param network - The network identifier
 * @returns The RPC URL for the network
 */
export function getAptosRpcUrl(network: AptosNetwork): string {
  return NetworkToNodeAPI[network];
}

/**
 * Aptos connected client type (for consistency with EVM/SVM patterns)
 * This represents a read-only connection to the Aptos network
 */
export interface AptosConnectedClient {
  network: Network;
  rpcUrl: string;
}

/**
 * Creates an Aptos connected client for the given network
 * This is a read-only client used for verification (no signing capabilities)
 *
 * @param network - The network to connect to
 * @returns An Aptos connected client instance
 */
export function createAptosConnectedClient(network: Network): AptosConnectedClient {
  const aptosNetwork = getAptosNetwork(network);
  return {
    network,
    rpcUrl: getAptosRpcUrl(aptosNetwork),
  };
}
