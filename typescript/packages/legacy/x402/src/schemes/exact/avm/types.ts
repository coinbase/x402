import { z } from "zod";
import { AlgodClient } from "@algorandfoundation/algokit-utils/algod-client";

/**
 * AVM (Algorand) exact scheme payload structure
 */
export const ExactAvmPayloadSchema = z.object({
  paymentGroup: z.array(z.string()), // Base64-encoded msgpack transactions
  paymentIndex: z.number().int().nonnegative(), // Index of payment transaction
});

export type ExactAvmPayload = z.infer<typeof ExactAvmPayloadSchema>;

/**
 * Type guard for ExactAvmPayload
 *
 * @param payload - The value to check
 * @returns True if the value is a valid ExactAvmPayload
 */
export function isExactAvmPayload(payload: unknown): payload is ExactAvmPayload {
  return ExactAvmPayloadSchema.safeParse(payload).success;
}

/**
 * Represents a wallet account with address and name
 */
export interface WalletAccount {
  /** The Algorand address of the account */
  address: string;
  /** The name of the account */
  name?: string;
  /** Sign transactions with the wallet */
  signTransactions: (
    txns: Uint8Array[],
    indexesToSign?: number[],
  ) => Promise<(Uint8Array | null)[]>;
  /** The Algorand client instance */
  client: AlgodClient;
}

/**
 * Represents a wallet provider that can connect and sign transactions
 */
export interface WalletProvider {
  /** The ID of the wallet provider */
  id: string;
  /** Whether the wallet is connected */
  isConnected: boolean;
  /** The accounts available in the wallet */
  accounts: WalletAccount[];
  /** Connect to the wallet */
  connect: () => Promise<string[]>;
  /** Disconnect from the wallet */
  disconnect: () => Promise<void>;
  /** Sign transactions with the wallet */
  signTransactions: (
    txns: Uint8Array[],
    indexesToSign?: number[],
  ) => Promise<(Uint8Array | null)[]>;
}

/**
 * Represents the Algorand client for blockchain interactions
 */
export interface AlgorandClient {
  /** The Algorand client instance */
  client: AlgodClient;
  /** The network ID */
  network: string;
}
