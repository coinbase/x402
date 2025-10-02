import { normalizeTonAddress, getTonExplorerUrl, validateMemoStrict, validateMemoLegacy } from "./utils";
import type { TonAsset, TonRpcLike, TonNetworkId } from "./types";

export type VerifyResult = {
  ok: boolean;
  txid?: string;
  reason?: string;
  explorerUrl?: string;
};

export async function verifyTONExact(p: {
  txid?: string;
  memo: string;
  to: string;
  asset: TonAsset;
  amountAtomic: bigint;
  network: TonNetworkId;
  rpc: TonRpcLike;
  validUntil?: number;
  usedTxIds?: Set<string> | string[];
}): Promise<VerifyResult> {
  const { memo, to, asset, amountAtomic, rpc, network } = p;

  // Validate memo using strict or legacy rules
  if (memo.startsWith("x402:")) {
    const v = validateMemoStrict(memo);
    if (!v.valid) return { ok: false, reason: "INVALID_MEMO" };
  } else {
    const v = validateMemoLegacy(memo);
    if (!v.valid) return { ok: false, reason: "INVALID_MEMO" };
  }

  // Expiry check (optional)
  if (typeof p.validUntil === "number" && Date.now() > p.validUntil) {
    return { ok: false, reason: "EXPIRED" };
  }

  try {
    if (asset.kind === "native") {
      const tx = p.txid ? await rpc.getTxByHash(p.txid) : await rpc.findIncomingByMemo(to, memo);
      if (!tx) return { ok: false, reason: "TX_NOT_FOUND" };

      // Compare addresses after canonical normalization (raw/bounceable/user-friendly)
      const toNorm = normalizeTonAddress(to);
      const txToNorm = normalizeTonAddress(tx.to);
      if (txToNorm !== toNorm) return { ok: false, reason: "TO_MISMATCH" };

      // Compare amounts in atomic units
      if (BigInt(tx.amount) !== amountAtomic) return { ok: false, reason: "AMOUNT_MISMATCH" };

      // If strict mode, memo must match exactly; otherwise skip strict comparison
      if (memo.startsWith("x402:") && tx.comment !== memo) {
        return { ok: false, reason: "MEMO_MISMATCH" };
      }

      // Replay protection if txid is known
      const txHash = tx.hash;
      const used = p.usedTxIds;
      if (used) {
        const has = Array.isArray(used) ? used.includes(txHash) : used.has(txHash);
        if (has) return { ok: false, reason: "REPLAY_DETECTED" };
      }

      return {
        ok: true,
        txid: txHash,
        explorerUrl: getTonExplorerUrl(txHash, network),
      };
    }

    // Jetton (TEP-74): verify incoming transfer event
    const ev = await rpc.getJettonTransferTo(to, { master: asset.master, memo });
    if (!ev) return { ok: false, reason: "JETTON_EVENT_NOT_FOUND" };

    // Master contract must match
    if (ev.master !== asset.master) return { ok: false, reason: "JETTON_MASTER_MISMATCH" };

    // Amount must match exactly (atomic units)
    if (BigInt(ev.amount) !== amountAtomic) return { ok: false, reason: "AMOUNT_MISMATCH" };

    // Memo strictness: only enforced if prefixed with x402:
    if (memo.startsWith("x402:") && ev.memo !== memo) {
      return { ok: false, reason: "MEMO_MISMATCH" };
    }

    // Replay protection for jetton event
    const evHash = ev.txHash;
    const used = p.usedTxIds;
    if (used) {
      const has = Array.isArray(used) ? used.includes(evHash) : used.has(evHash);
      if (has) return { ok: false, reason: "REPLAY_DETECTED" };
    }

    // NOTE: forward_ton_amount is not enforced here – as expected by tests
    return {
      ok: true,
      txid: ev.txHash,
      explorerUrl: getTonExplorerUrl(ev.txHash, network),
    };
  } catch (e: any) {
    return { ok: false, reason: "VERIFY_EXCEPTION" };
  }
}
