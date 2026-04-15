import type { PaymentPayload, SettleResponse } from "@x402/core/types";
import { isBatchedDepositPayload, isBatchedVoucherPayload } from "@x402/evm";
import type { BatchedEvmScheme } from "@x402/evm/batched/server";
import type express from "express";

export type ServerCliOptions = {
  verbose: boolean;
};

export type VoucherResolver = {
  resolve: (payload: PaymentPayload) => void;
  reject: (err: Error) => void;
};

export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function parseServerCliOptions(argv: string[]): ServerCliOptions {
  const verbose = argv.includes("-v") || argv.includes("--verbose");
  return { verbose };
}

export function sseWrite(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function getChunkChargeAmount(
  tokenCount: number,
  chunkSize: number,
  chunkAmountAtomic: string,
): string {
  if (tokenCount <= 0) return "0";
  if (tokenCount >= chunkSize) return chunkAmountAtomic;

  return ((BigInt(chunkAmountAtomic) * BigInt(tokenCount)) / BigInt(chunkSize)).toString();
}

export function getNextMaxClaimableAmount(
  chargedCumulativeAmount: string,
  chunkAmountAtomic: string,
): string {
  return (BigInt(chargedCumulativeAmount) + BigInt(chunkAmountAtomic)).toString();
}

export function getChannelIdFromPayload(paymentPayload: PaymentPayload): string | undefined {
  const raw = paymentPayload.payload as Record<string, unknown>;

  if (isBatchedVoucherPayload(raw)) {
    return typeof raw.channelId === "string" ? raw.channelId : undefined;
  }

  if (!isBatchedDepositPayload(raw)) {
    return undefined;
  }

  const voucher = raw.voucher as Record<string, unknown>;
  return typeof voucher.channelId === "string" ? voucher.channelId : undefined;
}

export function formatChannelId(channelId: string | undefined): string {
  if (!channelId) return "unknown";
  if (channelId.length <= 14) return channelId;

  return `${channelId.slice(0, 6)} ... ${channelId.slice(-5)}`;
}

export function colorizeGreen(text: string): string {
  return `\u001b[32m${text}\u001b[0m`;
}

export function colorizeRed(text: string): string {
  return `\u001b[31m${text}\u001b[0m`;
}

export async function buildFinalPaymentResponse(
  batchedScheme: BatchedEvmScheme,
  paymentResponse: SettleResponse,
  channelId: string | undefined,
  requestStartCharged: string,
): Promise<SettleResponse> {
  if (!channelId) {
    return paymentResponse;
  }

  const session = await batchedScheme.getStorage().get(channelId);
  if (!session) {
    return paymentResponse;
  }

  const totalAmount = (
    BigInt(session.chargedCumulativeAmount) - BigInt(requestStartCharged)
  ).toString();

  return {
    ...paymentResponse,
    amount: totalAmount,
    extra: {
      ...paymentResponse.extra,
      channelId,
      chargedCumulativeAmount: session.chargedCumulativeAmount,
      balance: session.balance,
      totalClaimed: session.totalClaimed,
      withdrawRequestedAt: session.withdrawRequestedAt,
    },
  };
}

export function getAcceptedRenewalState(
  paymentPayload: PaymentPayload,
  chargedCumulativeAmount: string,
  balance: string,
): {
  chargedCumulativeAmount: string;
  balance: string;
  signedMaxClaimable: string;
  toppedUp: boolean;
} {
  const raw = paymentPayload.payload as Record<string, unknown>;

  if (isBatchedDepositPayload(raw)) {
    const voucher = raw.voucher as Record<string, unknown>;

    return {
      chargedCumulativeAmount,
      balance,
      signedMaxClaimable: String(voucher.maxClaimableAmount ?? "0"),
      toppedUp: true,
    };
  }

  return {
    chargedCumulativeAmount,
    balance,
    signedMaxClaimable: String(raw.maxClaimableAmount ?? "0"),
    toppedUp: false,
  };
}

export function toVoucherPayload(
  paymentPayload: PaymentPayload,
  requirements: PaymentPayload["accepted"],
): { channelId: string; payload: PaymentPayload } {
  const raw = paymentPayload.payload as Record<string, unknown>;

  if (!isBatchedDepositPayload(raw)) {
    return {
      channelId: raw.channelId as string,
      payload: paymentPayload,
    };
  }

  const voucherPart = raw.voucher as Record<string, unknown>;
  const depositPart = raw.deposit as Record<string, unknown>;

  return {
    channelId: voucherPart.channelId as string,
    payload: {
      x402Version: paymentPayload.x402Version,
      accepted: requirements,
      payload: {
        type: "voucher",
        channelConfig: depositPart.channelConfig,
        channelId: voucherPart.channelId,
        maxClaimableAmount: voucherPart.maxClaimableAmount,
        signature: voucherPart.signature,
      },
    },
  };
}

export function waitForVoucher(
  pendingVouchers: Map<string, VoucherResolver>,
  channelId: string,
  timeoutMs: number,
): Promise<PaymentPayload> {
  return new Promise<PaymentPayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingVouchers.delete(channelId);
      reject(new Error("Voucher renewal timed out"));
    }, timeoutMs);

    pendingVouchers.set(channelId, {
      resolve: (payload: PaymentPayload) => {
        clearTimeout(timer);
        pendingVouchers.delete(channelId);
        resolve(payload);
      },
      reject: (err: Error) => {
        clearTimeout(timer);
        pendingVouchers.delete(channelId);
        reject(err);
      },
    });
  });
}
