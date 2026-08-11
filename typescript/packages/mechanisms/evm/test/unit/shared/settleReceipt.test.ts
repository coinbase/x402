import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CONFIRMATION_TIMEOUT_MS,
  waitAndReturnSettleResponse,
} from "../../../src/shared/settleReceipt";
import { ErrSettlementPending } from "../../../src/exact/facilitator/errors";

// waitAndReturnSettleResponse is the single place every EVM scheme (exact, upto, batch)
// decides terminal vs settlement_pending after a broadcast. The boundary:
//   - invalid broadcast hash           -> terminal (no hash to reconcile against)
//   - receipt-wait failure             -> settlement_pending (hash kept)
//   - reverted receipt                 -> terminal (definitively failed on-chain)
//   - validateReceipt returns failure  -> terminal (confirmed, but did not settle)
//   - unexpected throw while processing -> settlement_pending (confirmed, effect unknown)
// The last case must never be terminal: the tx is on-chain and may have succeeded, so a
// terminal result could prompt a double-spend retry.

const TX = `0x${"ab".repeat(32)}` as `0x${string}`;
const FAILED = "invalid_exact_evm_transaction_failed";
const NETWORK = "eip155:8453" as never;

const signerWith = (receipt: unknown, error?: Error): any => ({
  waitForTransactionReceipt: async () => {
    if (error) throw error;
    return receipt;
  },
});

const okReceipt = { status: "success", logs: [] };

describe("waitAndReturnSettleResponse terminal/pending boundary", () => {
  it("returns terminal for an invalid broadcast hash", async () => {
    const out = await waitAndReturnSettleResponse(
      signerWith(okReceipt),
      "0xnope" as `0x${string}`,
      NETWORK,
      undefined,
      { failedStatusReason: FAILED },
    );
    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(FAILED);
    expect(out.transaction).toBe("");
  });

  it("returns settlement_pending when the receipt wait fails", async () => {
    const out = await waitAndReturnSettleResponse(
      signerWith(undefined, new Error("rpc timeout")),
      TX,
      NETWORK,
      undefined,
      { failedStatusReason: FAILED },
    );
    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(ErrSettlementPending);
    expect(out.transaction).toBe(TX);
  });

  it("returns terminal for a reverted receipt", async () => {
    const out = await waitAndReturnSettleResponse(
      signerWith({ status: "reverted", logs: [] }),
      TX,
      NETWORK,
      undefined,
      { failedStatusReason: FAILED },
    );
    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(FAILED);
    expect(out.transaction).toBe(TX);
  });

  it("returns terminal when validateReceipt reports a clean failure", async () => {
    const out = await waitAndReturnSettleResponse(signerWith(okReceipt), TX, NETWORK, undefined, {
      failedStatusReason: FAILED,
      validateReceipt: () => ({
        success: false,
        errorReason: FAILED,
        transaction: TX,
        network: NETWORK,
      }),
    });
    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(FAILED);
  });

  it("returns settlement_pending when validateReceipt throws", async () => {
    const out = await waitAndReturnSettleResponse(signerWith(okReceipt), TX, NETWORK, undefined, {
      failedStatusReason: FAILED,
      validateReceipt: () => {
        throw new Error("log decode failed");
      },
    });
    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(ErrSettlementPending);
    expect(out.transaction).toBe(TX);
  });

  it("returns settlement_pending when onSuccess rejects", async () => {
    const out = await waitAndReturnSettleResponse(signerWith(okReceipt), TX, NETWORK, undefined, {
      failedStatusReason: FAILED,
      onSuccess: async () => {
        throw new Error("amount parse failed");
      },
    });
    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(ErrSettlementPending);
    expect(out.transaction).toBe(TX);
  });

  it("returns success with the hash on a confirmed receipt", async () => {
    const out = await waitAndReturnSettleResponse(signerWith(okReceipt), TX, NETWORK, "0xpayer", {
      failedStatusReason: FAILED,
      amount: "100",
    });
    expect(out.success).toBe(true);
    expect(out.transaction).toBe(TX);
    expect(out.amount).toBe("100");
  });
});

// viem's default receipt wait is 3 minutes, which outlives the request deadline on most
// serverless platforms: the process is killed mid-wait and the caller gets a 5xx with no
// hash, never reaching the settlement_pending path above. Bounding the wait below the
// platform limit is what makes that path reachable.
describe("waitAndReturnSettleResponse confirmation timeout", () => {
  it("bounds the wait at viem's default when no timeout is configured", async () => {
    const waitForTransactionReceipt = vi.fn().mockResolvedValue(okReceipt);

    await waitAndReturnSettleResponse({ waitForTransactionReceipt } as any, TX, NETWORK, undefined);

    expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: TX,
      timeout: DEFAULT_CONFIRMATION_TIMEOUT_MS,
    });
  });

  it("forwards a configured confirmationTimeoutMs to the signer", async () => {
    const waitForTransactionReceipt = vi.fn().mockResolvedValue(okReceipt);

    await waitAndReturnSettleResponse(
      { waitForTransactionReceipt } as any,
      TX,
      NETWORK,
      undefined,
      {
        confirmationTimeoutMs: 25_000,
      },
    );

    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX, timeout: 25_000 });
  });

  it("returns settlement_pending with the hash when the bounded wait times out", async () => {
    const out = await waitAndReturnSettleResponse(
      signerWith(undefined, new Error("Timed out while waiting for transaction to be confirmed")),
      TX,
      NETWORK,
      undefined,
      { failedStatusReason: FAILED, confirmationTimeoutMs: 25_000 },
    );

    expect(out.success).toBe(false);
    expect(out.errorReason).toBe(ErrSettlementPending);
    expect(out.transaction).toBe(TX);
  });
});
