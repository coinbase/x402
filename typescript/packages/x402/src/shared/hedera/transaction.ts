import { Transaction, TransferTransaction, AccountId, Hbar, TokenId } from "@hashgraph/sdk";
import { HederaSigner } from "./wallet";

/**
 * Creates a HBAR (native currency) transfer transaction.
 * 
 * This function creates a TransferTransaction for native HBAR transfers.
 * The amount is specified in tinybars, where 1 HBAR = 100,000,000 tinybars.
 * 
 * @param fromAccount - The sender account ID
 * @param toAccount - The receiver account ID  
 * @param amount - The amount in tinybars (1 HBAR = 100,000,000 tinybars)
 * @returns A TransferTransaction ready for signing and execution
 * 
 * @example
 * ```typescript
 * const transaction = createHbarTransferTransaction(
 *   AccountId.fromString("0.0.123456"),
 *   AccountId.fromString("0.0.789012"),
 *   "100000000" // 1 HBAR
 * );
 * ```
 */
export function createHbarTransferTransaction(
  fromAccount: AccountId,
  toAccount: AccountId,
  amount: string,
): TransferTransaction {
  return new TransferTransaction()
    .addHbarTransfer(fromAccount, Hbar.fromTinybars(-amount))
    .addHbarTransfer(toAccount, Hbar.fromTinybars(amount));
}

/**
 * Creates a token transfer transaction for Hedera Token Service (HTS) tokens.
 * 
 * This function creates a TransferTransaction for HTS token transfers.
 * The amount is specified in the token's smallest unit (based on token decimals).
 * 
 * @param tokenId - The HTS token ID to transfer
 * @param fromAccount - The sender account ID
 * @param toAccount - The receiver account ID
 * @param amount - The amount in token's smallest unit
 * @returns A TransferTransaction ready for signing and execution
 * 
 * @example
 * ```typescript
 * const transaction = createTokenTransferTransaction(
 *   TokenId.fromString("0.0.429274"),
 *   AccountId.fromString("0.0.123456"),
 *   AccountId.fromString("0.0.789012"),
 *   "1000000" // 1 token (6 decimals)
 * );
 * ```
 */
export function createTokenTransferTransaction(
  tokenId: TokenId,
  fromAccount: AccountId,
  toAccount: AccountId,
  amount: string,
): TransferTransaction {
  return new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccount, -parseInt(amount))
    .addTokenTransfer(tokenId, toAccount, parseInt(amount));
}

/**
 * Serializes a transaction to base64 encoded bytes for transmission.
 * 
 * This function converts a Hedera transaction to a base64 string that can be
 * transmitted over HTTP headers or stored for later execution.
 * 
 * @param transaction - The transaction to serialize
 * @returns Base64 encoded transaction bytes
 * 
 * @example
 * ```typescript
 * const serialized = serializeTransaction(signedTransaction);
 * // Use in payment header: `X-Payment: ${serialized}`
 * ```
 */
export function serializeTransaction(transaction: Transaction): string {
  return Buffer.from(transaction.toBytes()).toString("base64");
}

/**
 * Deserializes a transaction from base64 encoded bytes.
 * 
 * This function reconstructs a Hedera transaction from a base64 string,
 * typically received from payment headers or stored transaction data.
 * 
 * @param transactionBytes - Base64 encoded transaction bytes
 * @returns The deserialized transaction ready for execution
 * @throws Error if the base64 string is invalid or corrupted
 * 
 * @example
 * ```typescript
 * const transaction = deserializeTransaction(base64String);
 * await transaction.execute(client);
 * ```
 */
export function deserializeTransaction(transactionBytes: string): Transaction {
  const bytes = Buffer.from(transactionBytes, "base64");
  return Transaction.fromBytes(bytes);
}

/**
 * Signs a transaction with the provided Hedera signer.
 * 
 * This function signs a transaction using the signer's private key.
 * The transaction must be frozen before signing.
 * 
 * @param transaction - The transaction to sign (must be frozen)
 * @param signer - The Hedera signer containing the private key
 * @returns The signed transaction ready for execution
 * @throws Error if signing fails or transaction is not frozen
 * 
 * @example
 * ```typescript
 * const signedTx = await signTransaction(frozenTransaction, hederaSigner);
 * await signedTx.execute(client);
 * ```
 */
export async function signTransaction(transaction: Transaction, signer: HederaSigner): Promise<Transaction> {
  return await transaction.sign(signer.privateKey);
}

/**
 * Adds an additional signature to a transaction (for fee payer scenarios).
 * 
 * This function is used in scenarios where a facilitator pays transaction fees.
 * The facilitator signs the transaction in addition to the original signer.
 * 
 * @param transaction - The transaction to add signature to
 * @param signer - The additional signer (typically the facilitator)
 * @returns The transaction with the additional signature
 * @throws Error if signing fails
 * 
 * @example
 * ```typescript
 * // Facilitator adds their signature for fee payment
 * const multiSignedTx = await addSignatureToTransaction(transaction, facilitatorSigner);
 * ```
 */
export async function addSignatureToTransaction(
  transaction: Transaction,
  signer: HederaSigner,
): Promise<Transaction> {
  return await transaction.sign(signer.privateKey);
}
