/**
 * Signer interfaces for Kaspa x402 integration.
 *
 * Kaspa uses Schnorr signatures over secp256k1.
 * UTXO model: the client must select UTXOs and construct transactions.
 *
 * kaspa-wasm API reference:
 *   - PrivateKey → toKeypair() → { publicKey, xOnlyPublicKey, toAddress(network) }
 *   - signTransaction(tx, signerArray, verifyScripts) → SignableTransaction
 *   - signMessage({ message, privateKey }) → string (signature hex)
 *   - verifyMessage({ message, signature, publicKey }) → boolean
 *   - RpcClient → submitTransaction, getUtxosByAddresses, etc.
 */

import type {
  KaspaAddress,
  TransactionId,
  UtxoEntry,
  TransactionOutput,
  ParsedTransaction,
} from "./types.js";

/**
 * Client-side signer — used to create and sign payment transactions.
 *
 * Backed by kaspa-wasm PrivateKey + RpcClient.
 */
export type ClientKaspaSigner = {
  /** The client's Kaspa address (bech32, e.g., "kaspa:qr0lr4ml...") */
  readonly address: KaspaAddress;

  /**
   * Convert a Kaspa address to a ScriptPublicKey.
   *
   * Implementation: use kaspa-wasm Address class to decode the bech32 address,
   * then construct the P2PK script: "20" + xOnlyPubKey + "ac".
   *
   * For P2SH addresses, the script format differs.
   */
  resolveAddress(address: KaspaAddress): { version: number; script: string };

  /**
   * Get available UTXOs for the client's address.
   * Implementation: RpcClient.getUtxosByAddresses([address])
   */
  getUtxos(): Promise<UtxoEntry[]>;

  /**
   * Create and sign a Kaspa transaction.
   *
   * Implementation should:
   * 1. Build TransactionInput[] from utxos (using new Hash() for outpoint)
   * 2. Build TransactionOutput[] using (value, new ScriptPublicKey(ver, script))
   * 3. Construct Transaction({ version: 0, inputs, outputs, ... })
   * 4. Sign with kaspa.signTransaction(tx, [privateKey])
   * 5. Return hex-encoded signed transaction
   *
   * @param outputs - Transaction outputs (payment + change)
   * @param utxos - UTXOs to consume
   * @returns Hex-encoded signed transaction
   */
  signTransaction(outputs: TransactionOutput[], utxos: UtxoEntry[]): Promise<string>;
};

/**
 * Facilitator-side signer — used to verify and broadcast transactions.
 *
 * Backed by kaspa-wasm RpcClient connected to a Kaspa node.
 * The facilitator does NOT sign — only verifies and broadcasts.
 */
export type FacilitatorKaspaSigner = {
  /**
   * Get the facilitator's managed addresses.
   * These are the payTo addresses the facilitator accepts.
   */
  getAddresses(): readonly KaspaAddress[];

  /**
   * Parse a serialized transaction and extract its inputs/outputs.
   *
   * Implementation: deserialize hex TX via kaspa-wasm Transaction class,
   * extract input outpoints and output (address, amount) pairs.
   *
   * Used by the facilitator to check that outputs match payment requirements
   * before performing full signature/UTXO verification.
   */
  parseTransaction(transaction: string): Promise<ParsedTransaction>;

  /**
   * Verify that a signed transaction is valid.
   * Checks: signature validity, UTXO existence, sufficient funds.
   *
   * Implementation: deserialize TX, verify Schnorr signatures,
   * check that referenced UTXOs exist and are unspent.
   */
  verifyTransaction(transaction: string): Promise<boolean>;

  /**
   * Submit a signed transaction to the Kaspa network.
   * Implementation: RpcClient.submitTransaction(tx)
   *
   * @returns Transaction ID (hex, 32 bytes)
   */
  submitTransaction(transaction: string): Promise<TransactionId>;

  /**
   * Wait for a transaction to be confirmed (accepted in the DAG).
   * At 10 BPS, confirmation is typically < 10 seconds.
   */
  waitForConfirmation(transactionId: TransactionId, timeoutMs?: number): Promise<boolean>;

  /**
   * Get the current balance of an address (in sompi).
   * Implementation: RpcClient.getBalanceByAddress(address)
   */
  getBalance(address: KaspaAddress): Promise<bigint>;

  /**
   * Get UTXOs for an address.
   * Implementation: RpcClient.getUtxosByAddresses([address])
   */
  getUtxos(address: KaspaAddress): Promise<UtxoEntry[]>;
};
