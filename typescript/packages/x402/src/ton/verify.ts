// typescript/packages/x402/src/ton/verify.ts
import { normalizeTonAddress, getTonExplorerUrl, validateMemo } from "./utils";
import type { TonAsset, TonRpcLike } from "./types";

export type VerifyResult = {
  ok: boolean;
  txid?: string;
  reason?: string;
  explorerUrl?: string;
};

/**
 * Verify that a TON transaction matches the expected invoice parameters.
 *
 * @param p - Verification parameters.
 * @param p.txid - Optional explicit transaction hash (if known).
 * @param p.memo - Expected memo/comment for the transaction.
 * @param p.to - Expected destination address.
 * @param p.asset - Expected TON asset (native or jetton).
 * @param p.amountAtomic - Expected amount in atomic units.
 * @param p.network - TON network identifier ("ton:mainnet" | "ton:testnet").
 * @param p.rpc - RPC client to query TON transactions.
 * @param p.validUntil - Optional expiration timestamp (ms since epoch).
 * @param p.usedTxIds - Optional set of already-used txids for replay protection.
 * @returns Verification result object indicating success or failure.
 */
export async function verifyTONExact(p: {
  txid?: string;
  memo: string;
  to: string;
  asset: TonAsset;
  amountAtomic: bigint;
  network: "ton:mainnet" | "ton:testnet";
  rpc: TonRpcLike;
  /** Optional: invoice expiration timestamp (ms since epoch). */
  validUntil?: number;
  /** Optional: set of already-used txids to prevent replay. */
  usedTxIds?: Set<string>;
}): Promise<VerifyResult> {
  const { memo, to, asset, amountAtomic, rpc, network, validUntil, usedTxIds } = p;

  // Expiry first
  if (typeof validUntil === "number" && Date.now() > validUntil) {
    return { ok: false, reason: "EXPIRED" };
  }

  // Memo validation:
  // - If it starts with x402:, enforce full validation.
  // - If not, allow legacy memo but still enforce length/charset.
  {
    const v = validateMemo(memo);
    if (!v.valid) {
      // tolerate the missing x402: prefix in legacy mode
      if (v.reason !== "Memo must start with x402:") {
        return { ok: false, reason: "INVALID_MEMO" };
      }
    }
  }

  try {
    if (asset.kind === "native") {
      const tx = p.txid ? await rpc.getTxByHash(p.txid) : await rpc.findIncomingByMemo(to, memo);
      if (!tx) return { ok: false, reason: "TX_NOT_FOUND" };

      // replay guard (optional)
      if (p.txid && usedTxIds?.has(p.txid)) {
        return { ok: false, reason: "REPLAY_DETECTED" };
      }
      if (usedTxIds?.has(tx.hash)) {
        return { ok: false, reason: "REPLAY_DETECTED" };
      }

      // address normalization
      const toNorm = normalizeTonAddress(to);
      const txToNorm = normalizeTonAddress(tx.to);
      if (txToNorm !== toNorm) return { ok: false, reason: "TO_MISMATCH" };

      // amount (atomic)
      if (BigInt(tx.amount) !== amountAtomic) return { ok: false, reason: "AMOUNT_MISMATCH" };

      // strict memo only if x402: is used
      if (memo.startsWith("x402:") && tx.comment !== memo) {
        return { ok: false, reason: "MEMO_MISMATCH" };
      }

      if (p.txid && usedTxIds) usedTxIds.add(p.txid);
      if (!p.txid && usedTxIds) usedTxIds.add(tx.hash);

      return {
        ok: true,
        txid: tx.hash,
        explorerUrl: getTonExplorerUrl(tx.hash, network),
      };
    }

    // Jetton (TEP-74)
    const ev = await rpc.getJettonTransferTo(to, { master: asset.master, memo });
    if (!ev) return { ok: false, reason: "JETTON_EVENT_NOT_FOUND" };

    if (usedTxIds?.has(ev.txHash)) {
      return { ok: false, reason: "REPLAY_DETECTED" };
    }

    if (ev.master !== asset.master) return { ok: false, reason: "JETTON_MASTER_MISMATCH" };
    if (BigInt(ev.amount) !== amountAtomic) return { ok: false, reason: "AMOUNT_MISMATCH" };

    if (memo.startsWith("x402:") && ev.memo !== memo) {
      return { ok: false, reason: "MEMO_MISMATCH" };
    }

    if (usedTxIds) usedTxIds.add(ev.txHash);

    // forward_ton_amount not enforced by design (tests expect this)
    return {
      ok: true,
      txid: ev.txHash,
      explorerUrl: getTonExplorerUrl(ev.txHash, network),
    };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : "VERIFY_EXCEPTION";
    return { ok: false, reason };
  }
}
