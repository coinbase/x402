import { type Address, decodeEventLog, erc20Abi, type Hex, isHex, parseAbiItem } from "viem";
import type { PublicClient } from "viem";
import { withEvmClientsRetry } from "./evmClient";

/** Parameters for ERC-20 exact verification by tx hash. */
export type VerifyExactParams = {
  /** ERC-20 token address (e.g., USDT on BSC). */
  token: Address;
  /** Expected recipient address. */
  to: Address;
  /** Required amount in atomic units (token decimals). */
  amountAtomic: bigint;
  /**
   * Optional memo carried off-chain. Standard ERC-20 Transfer has no memo field;
   * if you enforce memo on-chain, you'll need an app-specific method.
   */
  memo?: string;
};

/** Result returned by all verifiers. */
export type VerifyExactResult = {
  isValid: boolean;
  reason?: string;
  txHash?: Hex;
  payer?: Address;
  explorerUrl?: string;
};

/** Parameters for native (BNB) exact verification by tx hash. */
export type VerifyNativeExactParams = {
  /** Expected recipient address. */
  to: Address;
  /** Required amount in wei (atomic units). */
  amountWei: bigint;
  /**
   * Stricter validation: require simple value transfer with empty calldata.
   * Defaults to true to avoid counting internal value transfers from contracts.
   */
  requireEmptyInput?: boolean;
  /** Optional memo to soft-validate from tx.input (best-effort). */
  memo?: string;
  /** Optional idempotency set to block replaying the same tx. */
  usedTxIds?: Set<Hex>;
};

/**
 * Normalize an EVM address for case-insensitive comparisons.
 *
 * @param a - Address string (may be nullish).
 * @returns Lowercased address or empty string.
 */
function normAddr(a: string | null | undefined): string {
  return (a ?? "").toLowerCase();
}

/**
 * Build the BSC explorer base URL from a viem PublicClient.
 *
 * @param client - viem PublicClient with an optional `chain.id`.
 * @returns BscScan base URL for the client's chain or empty string when unknown.
 */
function explorerBaseFromClient(client: PublicClient): string {
  type ChainWithId = { id?: number }; // avoids `any`
  const id = (client.chain as ChainWithId | undefined)?.id;

  if (id === 97) return "https://testnet.bscscan.com/tx/";
  if (id === 56) return "https://bscscan.com/tx/";
  return "";
}

/**
 * Best-effort ASCII memo decode from a 0x-prefixed calldata hex string.
 *
 * @param input - 0x-prefixed hex string (transaction input).
 * @returns Decoded ASCII string or null when not decodable/empty.
 */
function decodeMemoFromInput(input: Hex): string | null {
  try {
    if (!input || input === "0x") return null;
    const hex = input.startsWith("0x") ? input.slice(2) : input;
    const bytes = hex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) ?? [];
    return String.fromCharCode(...bytes).replace(/[^\x20-\x7E]+/g, "");
  } catch {
    return null;
  }
}

/**
 * Attempt to decode an ERC-20 `Transfer` event log.
 *
 * @param log - Raw log object to inspect.
 * @param log.address - Emitting contract address.
 * @param log.data - ABI-encoded data blob (value).
 * @param log.topics - Event topics array (signature + indexed args).
 * @param token - Expected ERC-20 token contract address to match against.
 * @returns Decoded `{ from, to, value }` or `null` if the log doesn't match Transfer.
 */
function tryDecodeTransfer(
  log: { address: Address; data: Hex; topics: readonly Hex[] },
  token: Address,
): { from: Address; to: Address; value: bigint } | null {
  if (log.address.toLowerCase() !== token.toLowerCase()) return null;
  try {
    if (!log.topics || log.topics.length === 0) return null;
    const topics = [...log.topics] as [Hex, ...Hex[]];
    const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics });
    if (decoded.eventName !== "Transfer") return null;

    const { from, to, value } = decoded.args as {
      from: Address;
      to: Address;
      value: bigint;
    };
    return { from, to, value };
  } catch {
    return null;
  }
}

/**
 * Verify ERC-20 **EXACT** payment by a specific transaction hash.
 *
 * Succeeds iff the receipt contains exactly one `Transfer` with:
 *  - `log.address === token`
 *  - `to === params.to`
 *  - `value === params.amountAtomic`
 * Also enforces finality (default 12 confirmations) and optional idempotency.
 *
 * @param clients - Ordered list of viem PublicClient instances (used with fallback).
 * @param txHash - Transaction hash (0x-prefixed).
 * @param params - Verification parameters (`token`, `to`, `amountAtomic`, optional `memo`, `finalityConfirmations`, `usedTxIds`).
 * @returns Verification result with `isValid`, optional `payer`, `txHash`, and `explorerUrl` or failure `reason`.
 */
export async function verifyErc20ExactByTxHash(
  clients: PublicClient[],
  txHash: Hex,
  params: VerifyExactParams & { finalityConfirmations?: number; usedTxIds?: Set<Hex> },
): Promise<VerifyExactResult> {
  if (!isHex(txHash)) return { isValid: false, reason: "INVALID_TX_HASH" };

  try {
    const receipt = await withEvmClientsRetry(clients, c =>
      c.getTransactionReceipt({ hash: txHash }),
    );

    // Finality (default 12 confirmations)
    const headNumber = await withEvmClientsRetry(clients, c => c.getBlockNumber());
    const minedAt =
      typeof receipt.blockNumber === "bigint" ? receipt.blockNumber : BigInt(receipt.blockNumber);
    const head = typeof headNumber === "bigint" ? headNumber : BigInt(headNumber);
    const minConf = BigInt(params.finalityConfirmations ?? 12);
    if (head - minedAt < minConf) return { isValid: false, reason: "INSUFFICIENT_FINALITY" };

    // Enforce exactly one matching ERC-20 Transfer with exact amount
    const toN = normAddr(params.to);
    const tokenN = normAddr(params.token);
    const matches: { from: Address; to: Address; value: bigint }[] = [];

    for (const log of receipt.logs) {
      if (normAddr(log.address) !== tokenN) continue;
      const t = tryDecodeTransfer(
        log as unknown as { address: Address; data: Hex; topics: readonly Hex[] },
        params.token,
      );
      if (!t) continue;
      if (normAddr(t.to) !== toN) continue;
      if (t.value !== params.amountAtomic) continue; // EXACT
      matches.push(t);
    }

    if (matches.length === 0) return { isValid: false, reason: "ERC20_EVENT_NOT_FOUND" };
    if (matches.length > 1) return { isValid: false, reason: "ERC20_EVENT_AMBIGUOUS" };

    // Idempotency
    if (params.usedTxIds?.has(txHash)) return { isValid: false, reason: "REPLAY_DETECTED" };
    params.usedTxIds?.add(txHash);

    const explorerUrl = explorerBaseFromClient(clients[0]) + txHash;
    return { isValid: true, txHash, payer: matches[0].from, explorerUrl };
  } catch (err) {
    return { isValid: false, reason: (err as Error)?.message ?? "VERIFY_FAILED" };
  }
}

/**
 * Verify native coin (BNB) **EXACT** payment by transaction hash.
 *
 * Checks:
 *  - `tx.to == params.to`
 *  - `tx.value == params.amountWei`
 *  - optional empty calldata enforcement (default true)
 *  - optional memo best-effort (from input)
 *  - finality (default 12 confirmations)
 *  - optional idempotency
 *
 * @param clients - Ordered list of viem PublicClient instances (used with fallback).
 * @param txHash - Transaction hash (0x-prefixed).
 * @param params - Verification parameters (`to`, `amountWei`, optional `requireEmptyInput`, `memo`, `finalityConfirmations`, `usedTxIds`).
 * @returns Verification result with `isValid`, optional `payer`, `txHash`, and `explorerUrl` or failure `reason`.
 */
export async function verifyNativeExactByTxHash(
  clients: PublicClient[],
  txHash: Hex,
  params: VerifyNativeExactParams & { finalityConfirmations?: number; usedTxIds?: Set<Hex> },
): Promise<VerifyExactResult> {
  if (!isHex(txHash)) return { isValid: false, reason: "INVALID_TX_HASH" };
  const { to, amountWei, requireEmptyInput = true } = params;

  try {
    const tx = await withEvmClientsRetry(clients, c => c.getTransaction({ hash: txHash }));
    const receipt = await withEvmClientsRetry(clients, c =>
      c.getTransactionReceipt({ hash: txHash }),
    );

    if (receipt.status !== "success") return { isValid: false, reason: "TX_REVERTED" };
    if (!tx.to) return { isValid: false, reason: "NO_TO_ADDRESS" };
    if (normAddr(tx.to) !== normAddr(to)) return { isValid: false, reason: "WRONG_RECIPIENT" };

    if (requireEmptyInput && tx.input && tx.input !== "0x") {
      return { isValid: false, reason: "NON_EMPTY_INPUT" };
    }

    // Optional memo (best-effort)
    if (params.memo && tx.input && tx.input !== "0x") {
      const decodedMemo = decodeMemoFromInput(tx.input);
      if (decodedMemo && !decodedMemo.includes(params.memo)) {
        return { isValid: false, reason: "INVALID_MEMO" };
      }
    }

    // EXACT amount
    if (tx.value !== amountWei) return { isValid: false, reason: "AMOUNT_MISMATCH" };

    // Finality (configurable)
    const headNumber = await withEvmClientsRetry(clients, c => c.getBlockNumber());
    const minedAt =
      typeof receipt.blockNumber === "bigint" ? receipt.blockNumber : BigInt(receipt.blockNumber);
    const head = typeof headNumber === "bigint" ? headNumber : BigInt(headNumber);
    const minConf = BigInt(params.finalityConfirmations ?? 12);
    if (head - minedAt < minConf) return { isValid: false, reason: "INSUFFICIENT_FINALITY" };

    // Idempotency
    if (params.usedTxIds?.has(txHash)) return { isValid: false, reason: "REPLAY_DETECTED" };
    params.usedTxIds?.add(txHash);

    const explorerUrl = explorerBaseFromClient(clients[0]) + txHash;
    return { isValid: true, txHash, payer: tx.from as Address, explorerUrl };
  } catch (err) {
    return { isValid: false, reason: (err as Error)?.message ?? "VERIFY_FAILED" };
  }
}

/**
 * Verify ERC-20 payment by scanning logs in a block range.
 *
 * Practical when you don't have `txHash`. By default accepts `value >= amountAtomic`.
 * (Switch to exact equality by changing the comparator if required.)
 *
 * @param clients - Ordered list of viem PublicClient instances (used with fallback).
 * @param params - `{ token, to, amountAtomic, fromBlock, toBlock?, finalityConfirmations? }`.
 * @returns Verification result or failure `reason`.
 */
export async function verifyErc20ExactByLogs(
  clients: PublicClient[],
  params: VerifyExactParams & {
    fromBlock: bigint;
    toBlock?: bigint;
    finalityConfirmations?: number;
  },
): Promise<VerifyExactResult> {
  try {
    const { token, to, amountAtomic, fromBlock, toBlock, finalityConfirmations = 12 } = params;

    const transferEvent = parseAbiItem(
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    );

    const logs = await withEvmClientsRetry(clients, c =>
      c.getLogs({ address: token, event: transferEvent, args: { to }, fromBlock, toBlock }),
    );

    for (const log of logs) {
      const match = tryDecodeTransfer(log, token);
      if (!match) continue;
      if (normAddr(match.to) !== normAddr(to)) continue;
      // Minimum (>=). Jeśli chcesz EXACT, zmień na !==.
      if (match.value < amountAtomic) continue;

      // Finality for found tx
      if (log.transactionHash) {
        const receipt = await withEvmClientsRetry(clients, c =>
          c.getTransactionReceipt({ hash: log.transactionHash }),
        );
        const headNumber = await withEvmClientsRetry(clients, c => c.getBlockNumber());
        const minedAt =
          typeof receipt.blockNumber === "bigint"
            ? receipt.blockNumber
            : BigInt(receipt.blockNumber);
        const head = typeof headNumber === "bigint" ? headNumber : BigInt(headNumber);
        if (head - minedAt < BigInt(finalityConfirmations)) continue;
      }

      const explorerUrl = log.transactionHash
        ? explorerBaseFromClient(clients[0]) + log.transactionHash
        : undefined;

      return { isValid: true, txHash: log.transactionHash!, payer: match.from, explorerUrl };
    }

    return { isValid: false, reason: "NO_MATCHING_TRANSFER" };
  } catch (err) {
    return { isValid: false, reason: (err as Error)?.message ?? "VERIFY_FAILED" };
  }
}
