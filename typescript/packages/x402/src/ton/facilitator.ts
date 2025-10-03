import { verifyTONExact } from "./verify";
import type { TonRpcLike, TonAsset } from "./types";

/**
 * Response from TON payment verification by facilitator.
 */
export type TonFacilitatorResponse = {
  /** Whether the payment was successfully verified. */
  success: boolean;
  /** Transaction hash if successful. */
  txHash?: string;
  /** Explorer URL if successful. */
  explorerUrl?: string;
  /** Error reason if verification failed. */
  errorReason?: string;
  /** Network where the transaction occurred. */
  network: "ton:mainnet" | "ton:testnet";
};

/**
 * Facilitator verification of TON payment.
 * Unlike Solana's settle (which signs and sends), TON uses post-verification:
 * the user has already sent the transaction, and we verify it happened correctly.
 *
 * @param params - Verification parameters
 * @param params.txid - Optional transaction ID to verify specific transaction
 * @param params.memo - Payment memo/invoice ID
 * @param params.to - Expected recipient address
 * @param params.asset - Asset being transferred (native TON or jetton)
 * @param params.amountAtomic - Expected amount in atomic units
 * @param params.network - TON network (mainnet or testnet)
 * @param params.rpc - RPC client for blockchain queries
 * @param params.validUntil - Optional expiration timestamp (ms since epoch)
 * @param params.usedTxIds - Optional set of already-used transaction IDs for replay protection
 * @returns Facilitator response with verification result
 */
export async function verifyTonPayment(params: {
  txid?: string;
  memo: string;
  to: string;
  asset: TonAsset;
  amountAtomic: bigint;
  network: "ton:mainnet" | "ton:testnet";
  rpc: TonRpcLike;
  validUntil?: number;
  usedTxIds?: Set<string>;
}): Promise<TonFacilitatorResponse> {
  const result = await verifyTONExact(params);

  if (result.ok) {
    return {
      success: true,
      txHash: result.txid,
      explorerUrl: result.explorerUrl,
      network: params.network,
    };
  }

  return {
    success: false,
    errorReason: result.reason,
    network: params.network,
  };
}

/**
 * Batch verification of multiple TON payments.
 * Useful for processing multiple invoices at once.
 *
 * @param payments - Array of payment verification parameters
 * @returns Array of facilitator responses
 */
export async function verifyTonPaymentBatch(
  payments: Array<{
    txid?: string;
    memo: string;
    to: string;
    asset: TonAsset;
    amountAtomic: bigint;
    network: "ton:mainnet" | "ton:testnet";
    rpc: TonRpcLike;
    validUntil?: number;
    usedTxIds?: Set<string>;
  }>,
): Promise<TonFacilitatorResponse[]> {
  return Promise.all(payments.map(payment => verifyTonPayment(payment)));
}

/**
 * Verify TON payment with automatic retry on temporary failures.
 * Useful when RPC might be temporarily unavailable or transaction not yet indexed.
 *
 * @param params - Verification parameters
 * @param params.txid - Optional transaction ID to verify specific transaction
 * @param params.memo - Payment memo/invoice ID
 * @param params.to - Expected recipient address
 * @param params.asset - Asset being transferred (native TON or jetton)
 * @param params.amountAtomic - Expected amount in atomic units
 * @param params.network - TON network (mainnet or testnet)
 * @param params.rpc - RPC client for blockchain queries
 * @param params.validUntil - Optional expiration timestamp (ms since epoch)
 * @param params.usedTxIds - Optional set of already-used transaction IDs for replay protection
 * @param options - Retry options
 * @param options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param options.retryDelay - Delay between retries in ms (default: 2000)
 * @returns Facilitator response with verification result
 */
export async function verifyTonPaymentWithRetry(
  params: {
    txid?: string;
    memo: string;
    to: string;
    asset: TonAsset;
    amountAtomic: bigint;
    network: "ton:mainnet" | "ton:testnet";
    rpc: TonRpcLike;
    validUntil?: number;
    usedTxIds?: Set<string>;
  },
  options: {
    maxRetries?: number;
    retryDelay?: number;
  } = {},
): Promise<TonFacilitatorResponse> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 2000;

  let lastResponse: TonFacilitatorResponse | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await verifyTonPayment(params);

    // Success - return immediately
    if (response.success) {
      return response;
    }

    lastResponse = response;

    // Don't retry on validation errors (these won't change)
    const nonRetryableErrors = [
      "INVALID_MEMO",
      "EXPIRED",
      "TO_MISMATCH",
      "AMOUNT_MISMATCH",
      "MEMO_MISMATCH",
      "JETTON_MASTER_MISMATCH",
      "REPLAY_DETECTED",
    ];

    if (response.errorReason && nonRetryableErrors.includes(response.errorReason)) {
      return response;
    }

    // TX_NOT_FOUND or network errors - retry after delay
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  return lastResponse!;
}
