import { 
  Transaction,
  TransferTransaction,
  AccountId,
  Hbar,
  TokenId,
  TokenTransferTransaction,
  PublicKey
} from "@hashgraph/sdk";
import { HederaSigner } from "./wallet";

/**
 * Creates a HBAR transfer transaction
 * 
 * @param fromAccount - The sender account ID
 * @param toAccount - The receiver account ID
 * @param amount - The amount in tinybars (1 HBAR = 100,000,000 tinybars)
 * @returns A transfer transaction
 */
export function createHbarTransferTransaction(
  fromAccount: AccountId,
  toAccount: AccountId,
  amount: string
): TransferTransaction {
  return new TransferTransaction()
    .addHbarTransfer(fromAccount, Hbar.fromTinybars(-amount))
    .addHbarTransfer(toAccount, Hbar.fromTinybars(amount));
}

/**
 * Creates a token transfer transaction
 * 
 * @param tokenId - The token ID
 * @param fromAccount - The sender account ID
 * @param toAccount - The receiver account ID
 * @param amount - The amount in token's smallest unit
 * @returns A token transfer transaction
 */
export function createTokenTransferTransaction(
  tokenId: TokenId,
  fromAccount: AccountId,
  toAccount: AccountId,
  amount: string
): TokenTransferTransaction {
  return new TokenTransferTransaction()
    .addTokenTransfer(tokenId, fromAccount, -amount)
    .addTokenTransfer(tokenId, toAccount, amount);
}

/**
 * Serializes a transaction to bytes for transmission
 * 
 * @param transaction - The transaction to serialize
 * @returns Base64 encoded transaction bytes
 */
export function serializeTransaction(transaction: Transaction): string {
  return Buffer.from(transaction.toBytes()).toString('base64');
}

/**
 * Deserializes a transaction from base64 bytes
 * 
 * @param transactionBytes - Base64 encoded transaction bytes
 * @returns The deserialized transaction
 */
export function deserializeTransaction(transactionBytes: string): Transaction {
  const bytes = Buffer.from(transactionBytes, 'base64');
  return Transaction.fromBytes(bytes);
}

/**
 * Signs a transaction with the provided signer
 * 
 * @param transaction - The transaction to sign
 * @param signer - The Hedera signer
 * @returns The signed transaction
 */
export function signTransaction(
  transaction: Transaction,
  signer: HederaSigner
): Transaction {
  return transaction.sign(signer.privateKey);
}

/**
 * Adds an additional signature to a transaction (for fee payer scenarios)
 * 
 * @param transaction - The transaction to sign
 * @param signer - The additional signer (typically the facilitator)
 * @returns The transaction with additional signature
 */
export function addSignatureToTransaction(
  transaction: Transaction,
  signer: HederaSigner
): Transaction {
  return transaction.sign(signer.privateKey);
}