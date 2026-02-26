import type { Network } from "@x402/core/types";
import { AccountId, Transaction } from "@hashgraph/sdk";
import {
  HBAR_ASSET_ID,
  HEDERA_ENTITY_ID_REGEX,
  HEDERA_MAINNET_CAIP2,
  HEDERA_TESTNET_CAIP2,
  SUPPORTED_HEDERA_NETWORKS,
} from "./constants";
import type {
  HederaTransferEntry,
  ExactHederaPayloadV2,
  InspectedHederaTransaction,
} from "./types";

/**
 * Validate a Hedera account or token id string.
 *
 * @param entityId - Entity id to validate
 * @returns True when valid
 */
export function isValidHederaEntityId(entityId: string): boolean {
  return HEDERA_ENTITY_ID_REGEX.test(entityId);
}

/**
 * Normalize and validate a Hedera CAIP-2 network.
 *
 * @param network - Network identifier
 * @returns Normalized network
 */
export function normalizeHederaNetwork(network: Network): string {
  if (!SUPPORTED_HEDERA_NETWORKS.includes(network as (typeof SUPPORTED_HEDERA_NETWORKS)[number])) {
    throw new Error(`Unsupported Hedera network: ${network}`);
  }
  return network;
}

/**
 * Returns true if the asset identifier is native HBAR.
 *
 * @param asset - Asset identifier
 * @returns True if HBAR
 */
export function isHbarAsset(asset: string): boolean {
  return asset === HBAR_ASSET_ID;
}

/**
 * Validate that an asset is either HBAR or an HTS token id.
 *
 * @param asset - Asset identifier
 * @returns True when valid
 */
export function isValidHederaAsset(asset: string): boolean {
  return isHbarAsset(asset) || isValidHederaEntityId(asset);
}

/**
 * Decode transaction from exact hedera payload.
 *
 * @param payload - Hedera payload
 * @returns Base64 transaction string
 */
export function decodeTransactionFromPayload(payload: ExactHederaPayloadV2): string {
  if (!payload || typeof payload.transaction !== "string" || payload.transaction.length === 0) {
    throw new Error("invalid_exact_hedera_payload_transaction");
  }
  return payload.transaction;
}

/**
 * Decode and inspect a Hedera transaction from base64 bytes.
 *
 * @param transactionBase64 - Base64-encoded Hedera transaction
 * @returns Normalized inspected transaction details
 */
export function inspectHederaTransaction(transactionBase64: string): InspectedHederaTransaction {
  const bytes = Buffer.from(transactionBase64, "base64");
  const transaction = Transaction.fromBytes(bytes) as {
    constructor?: { name?: string };
    transactionId?: { toString?: () => string; accountId?: { toString?: () => string } };
    _hbarTransfers?: unknown[];
    _tokenTransfers?: unknown[];
  };
  const isTransferTransaction =
    Array.isArray(transaction._hbarTransfers) && Array.isArray(transaction._tokenTransfers);
  const hbarTransfers = isTransferTransaction
    ? (transaction._hbarTransfers ?? []).map(transfer => normalizeHbarTransfer(transfer))
    : [];
  const tokenTransfers = isTransferTransaction
    ? normalizeTokenTransfers(transaction._tokenTransfers ?? [])
    : {};

  return {
    transactionType: transaction.constructor?.name ?? "",
    transactionId: transaction.transactionId?.toString?.() ?? "",
    transactionIdAccountId: transaction.transactionId?.accountId?.toString?.() ?? "",
    hasNonTransferOperations: !isTransferTransaction,
    hbarTransfers,
    tokenTransfers,
  };
}

/**
 * Sums a transfer list and returns net amount.
 *
 * @param transfers - Transfer entries
 * @returns Net sum
 */
export function sumTransfers(transfers: HederaTransferEntry[]): bigint {
  return transfers.reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
}

/**
 * Returns net transfer value received by an account.
 *
 * @param transfers - Transfer entries
 * @param accountId - Account to calculate for
 * @returns Net amount
 */
export function getNetForAccount(transfers: HederaTransferEntry[], accountId: string): bigint {
  return transfers
    .filter(entry => entry.accountId === accountId)
    .reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
}

/**
 * Returns all account ids with positive net receipts.
 *
 * @param transfers - Transfer entries
 * @returns Receiver ids
 */
export function getPositiveReceivers(transfers: HederaTransferEntry[]): string[] {
  const net = new Map<string, bigint>();
  for (const entry of transfers) {
    net.set(entry.accountId, (net.get(entry.accountId) ?? 0n) + BigInt(entry.amount));
  }
  return [...net.entries()].filter(([, value]) => value > 0n).map(([accountId]) => accountId);
}

/**
 * Convert decimal string/number to atomic units.
 *
 * @param decimalAmount - Decimal amount (e.g. "1.25")
 * @param decimals - Token decimals
 * @returns Atomic amount string
 */
export function convertToAtomicAmount(decimalAmount: string, decimals: number): string {
  const [whole = "0", fraction = ""] = decimalAmount.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
    throw new Error(`Invalid decimal amount: ${decimalAmount}`);
  }
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(`${whole}${paddedFraction || "0"}`).toString();
}

/**
 * Default network-specific HTS token config map key helper.
 *
 * @param network - CAIP-2 network
 * @returns Network key
 */
export function getNetworkKey(network: string): string {
  if (network === HEDERA_MAINNET_CAIP2) return HEDERA_MAINNET_CAIP2;
  if (network === HEDERA_TESTNET_CAIP2) return HEDERA_TESTNET_CAIP2;
  return network;
}

/**
 * Canonicalize a Hedera account id or alias when possible.
 *
 * @param accountIdOrAlias - Account or alias value
 * @returns Canonical id/alias, or original when parsing fails
 */
export function normalizeHederaAccountIdentifier(accountIdOrAlias: string): string {
  try {
    return AccountId.fromString(accountIdOrAlias).toString();
  } catch {
    return accountIdOrAlias;
  }
}

/**
 * Returns true when two account identifiers refer to the same account/alias.
 *
 * @param left - Left identifier
 * @param right - Right identifier
 * @returns True when canonicalized identifiers match
 */
export function hederaAccountIdsEqual(left: string, right: string): boolean {
  return normalizeHederaAccountIdentifier(left) === normalizeHederaAccountIdentifier(right);
}

/**
 * Normalize a raw SDK hbar transfer into shared transfer shape.
 *
 * @param transfer - Raw transfer object from Hedera SDK internals
 * @returns Normalized transfer entry
 */
function normalizeHbarTransfer(transfer: unknown): HederaTransferEntry {
  const candidate = transfer as {
    accountId?: { toString?: () => string };
    amount?: { toTinybars?: () => { toString?: () => string }; toString?: () => string };
  };
  return {
    accountId: candidate.accountId?.toString?.() ?? "",
    amount: candidate.amount?.toTinybars?.().toString?.() ?? candidate.amount?.toString?.() ?? "",
  };
}

/**
 * Group raw SDK token transfers by token id.
 *
 * @param tokenTransfers - Raw token transfer objects from Hedera SDK internals
 * @returns Token transfer map keyed by token id
 */
function normalizeTokenTransfers(tokenTransfers: unknown[]): Record<string, HederaTransferEntry[]> {
  const grouped: Record<string, HederaTransferEntry[]> = {};
  for (const tokenTransfer of tokenTransfers) {
    const candidate = tokenTransfer as {
      tokenId?: { toString?: () => string };
      accountId?: { toString?: () => string };
      amount?: { toString?: () => string };
    };
    const tokenId = candidate.tokenId?.toString?.() ?? "";
    if (tokenId.length === 0) {
      continue;
    }
    const normalizedTransfer = {
      accountId: candidate.accountId?.toString?.() ?? "",
      amount: candidate.amount?.toString?.() ?? "",
    };
    if (!grouped[tokenId]) {
      grouped[tokenId] = [];
    }
    grouped[tokenId].push(normalizedTransfer);
  }
  return grouped;
}
