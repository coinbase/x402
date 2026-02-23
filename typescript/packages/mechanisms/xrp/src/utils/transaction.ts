/**
 * XRP Transaction Utilities
 *
 * Helpers for building and validating XRP Payment transactions
 */

import { XrpPaymentTransaction, XrpMemo } from "../types";

export interface BuildPaymentTransactionParams {
  /** Source account (r...) */
  account: string;
  /** Destination account (r...) */
  destination: string;
  /** Amount in drops */
  amount: string;
  /** Transaction fee in drops */
  fee: string;
  /** Account sequence number */
  sequence: number;
  /** Ledger index at which transaction expires */
  lastLedgerSequence: number;
  /** Optional destination tag */
  destinationTag?: number;
  /** Optional memo data */
  memo?: {
    memoType: string;
    memoData: string;
  };
}

/**
 * Build a standard XRP Payment transaction
 *
 * @param params - Transaction parameters
 * @returns The payment transaction object
 */
export function buildPaymentTransaction(
  params: BuildPaymentTransactionParams,
): Omit<XrpPaymentTransaction, "TxnSignature" | "SigningPubKey"> {
  // Build memos if provided
  const memos: XrpMemo[] | undefined = params.memo
    ? [
        {
          Memo: {
            MemoType: params.memo.memoType,
            MemoData: params.memo.memoData,
          },
        },
      ]
    : undefined;

  // Build the base transaction
  const transaction: Omit<XrpPaymentTransaction, "TxnSignature" | "SigningPubKey"> = {
    TransactionType: "Payment",
    Account: params.account,
    Destination: params.destination,
    Amount: params.amount,
    Fee: params.fee,
    Sequence: params.sequence,
    LastLedgerSequence: params.lastLedgerSequence,
  };

  // Add optional fields if provided
  if (params.destinationTag !== undefined) {
    transaction.DestinationTag = params.destinationTag;
  }

  if (memos) {
    transaction.Memos = memos;
  }

  return transaction;
}

/**
 * Validate that a transaction fee is reasonable
 *
 * @param feeDrops - Fee in drops
 * @param maxFeeDrops - Maximum acceptable fee
 * @returns True if fee is acceptable
 */
export function isReasonableFee(feeDrops: string, maxFeeDrops: string = "10000"): boolean {
  return BigInt(feeDrops) <= BigInt(maxFeeDrops);
}

/**
 * Calculate the minimum required balance for an account
 * (base reserve + owner count * owner reserve)
 *
 * @param ownerCount - Number of objects owned by the account
 * @param baseReserveDrops - Base reserve in drops
 * @param ownerReserveDrops - Owner reserve per object in drops
 * @returns Total minimum balance in drops
 */
export function calculateMinimumBalance(
  ownerCount: number,
  baseReserveDrops: bigint = 1000000n,
  ownerReserveDrops: bigint = 200000n,
): bigint {
  return baseReserveDrops + BigInt(ownerCount) * ownerReserveDrops;
}

/**
 * Calculate the available spendable balance
 *
 * @param balanceDrops - Total account balance in drops
 * @param ownerCount - Number of objects owned
 * @param baseReserveDrops - Base reserve in drops
 * @param ownerReserveDrops - Owner reserve per object in drops
 * @returns Spendable balance in drops (can be negative if under-reserved)
 */
export function calculateSpendableBalance(
  balanceDrops: string | bigint,
  ownerCount: number,
  baseReserveDrops: bigint = 1000000n,
  ownerReserveDrops: bigint = 200000n,
): bigint {
  const total = typeof balanceDrops === "string" ? BigInt(balanceDrops) : balanceDrops;
  const minBalance = calculateMinimumBalance(ownerCount, baseReserveDrops, ownerReserveDrops);
  return total - minBalance;
}

/**
 * Check if an account has sufficient balance for a transaction
 *
 * @param balanceDrops - Account balance in drops
 * @param amountDrops - Transaction amount in drops
 * @param feeDrops - Transaction fee in drops
 * @param ownerCount - Number of objects owned
 * @param baseReserveDrops - Base reserve in drops
 * @returns True if account can afford the transaction
 */
export function hasSufficientBalance(
  balanceDrops: string,
  amountDrops: string,
  feeDrops: string,
  ownerCount: number = 0,
  baseReserveDrops: bigint = 1000000n,
): boolean {
  const totalRequired = BigInt(amountDrops) + BigInt(feeDrops);
  const available = calculateSpendableBalance(balanceDrops, ownerCount, baseReserveDrops);
  return available >= totalRequired;
}

/**
 * Validate transaction expiry (LastLedgerSequence)
 *
 * @param currentLedger - Current ledger index
 * @param lastLedgerSequence - Transaction expiry ledger
 * @returns Object with isValid and reason
 */
export function validateExpiry(
  currentLedger: number,
  lastLedgerSequence: number,
): { isValid: boolean; reason?: string } {
  // Must be in the future
  if (lastLedgerSequence <= currentLedger) {
    return {
      isValid: false,
      reason: `Transaction expired: LastLedgerSequence (${lastLedgerSequence}) <= current ledger (${currentLedger})`,
    };
  }

  // Should not be too far in the future (max 100 ledgers ~ 5 minutes)
  if (lastLedgerSequence > currentLedger + 100) {
    return {
      isValid: false,
      reason: "LastLedgerSequence too far in the future (max 100 ledgers)",
    };
  }

  return { isValid: true };
}

/**
 * Validate that a sequence number is reasonable for an account
 *
 * @param txSequence - The transaction sequence number
 * @param nextSequence - The expected next sequence number for the account
 * @param maxQueueSize - Maximum number of queued transactions to accept (default: 10)
 * @returns Object with isValid and reason
 */
export function validateSequence(
  txSequence: number,
  nextSequence: number,
  maxQueueSize: number = 10,
): { isValid: boolean; reason?: string } {
  // Transaction sequence must be at least the next expected sequence
  if (txSequence < nextSequence) {
    return {
      isValid: false,
      reason: `Sequence ${txSequence} already used (next expected: ${nextSequence})`,
    };
  }

  // Allow some lookahead for queued transactions
  if (txSequence > nextSequence + maxQueueSize) {
    return {
      isValid: false,
      reason: `Sequence ${txSequence} too far ahead (expected: ${nextSequence}-${nextSequence + maxQueueSize})`,
    };
  }

  return { isValid: true };
}
