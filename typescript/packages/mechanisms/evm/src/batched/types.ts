export type ChannelState = {
  balance: bigint;
  totalClaimed: bigint;
  withdrawRequestedAt: number;
  refundNonce: bigint;
};

export type ChannelConfig = {
  payer: `0x${string}`;
  payerAuthorizer: `0x${string}`;
  receiver: `0x${string}`;
  receiverAuthorizer: `0x${string}`;
  token: `0x${string}`;
  withdrawDelay: number;
  salt: `0x${string}`;
};

export type BatchedErc3009Authorization = {
  validAfter: string;
  validBefore: string;
  salt: `0x${string}`;
  signature: `0x${string}`;
};

export type BatchedDepositPayload = {
  type: "deposit";
  deposit: {
    channelConfig: ChannelConfig;
    amount: string;
    authorization: {
      erc3009Authorization?: BatchedErc3009Authorization;
    };
  };
  voucher: BatchedVoucherFields;
  responseExtra?: { chargedCumulativeAmount: string };
};

export type BatchedVoucherPayload = {
  type: "voucher";
  channelConfig: ChannelConfig;
} & BatchedVoucherFields;

export type BatchedVoucherFields = {
  channelId: `0x${string}`;
  maxClaimableAmount: string;
  signature: `0x${string}`;
  refund?: boolean;
};

export type BatchedVoucherClaim = {
  voucher: {
    channel: ChannelConfig;
    maxClaimableAmount: string;
  };
  signature: `0x${string}`;
  totalClaimed: string;
};

export type BatchedPaymentResponseExtra = {
  channelId: `0x${string}`;
  chargedCumulativeAmount: string;
  balance: string;
  totalClaimed: string;
  withdrawRequestedAt: number;
  refundNonce: string;
  refund?: true;
};

export type BatchedClaimPayload = {
  settleAction: "claim";
  claims: BatchedVoucherClaim[];
};

export type BatchedClaimWithSignaturePayload = {
  settleAction: "claimWithSignature";
  claims: BatchedVoucherClaim[];
  authorizerSignature: `0x${string}`;
};

export type BatchedSettleActionPayload = {
  settleAction: "settle";
  receiver: `0x${string}`;
  token: `0x${string}`;
};

export type BatchedDepositSettlePayload = {
  settleAction: "deposit";
  deposit: BatchedDepositPayload["deposit"];
};

export type BatchedRefundPayload = {
  settleAction: "refund";
  config: ChannelConfig;
  amount: string;
  claims: BatchedVoucherClaim[];
  responseExtra?: BatchedPaymentResponseExtra;
};

export type BatchedRefundWithSignaturePayload = {
  settleAction: "refundWithSignature";
  config: ChannelConfig;
  amount: string;
  nonce: string;
  claims: BatchedVoucherClaim[];
  receiverAuthorizerSignature: `0x${string}`;
  claimAuthorizerSignature?: `0x${string}`;
  responseExtra?: BatchedPaymentResponseExtra;
};

export type BatchedPayload = BatchedDepositPayload | BatchedVoucherPayload;

export type BatchedSettlePayload =
  | BatchedDepositSettlePayload
  | BatchedClaimPayload
  | BatchedClaimWithSignaturePayload
  | BatchedSettleActionPayload
  | BatchedRefundPayload
  | BatchedRefundWithSignaturePayload;

/**
 * Type guard for a batched deposit payload (deposit + voucher).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedDepositPayload}.
 */
export function isBatchedDepositPayload(
  payload: Record<string, unknown>,
): payload is BatchedDepositPayload {
  return payload.type === "deposit" && "deposit" in payload && "voucher" in payload;
}

/**
 * Type guard for a batched voucher-only payload.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedVoucherPayload}.
 */
export function isBatchedVoucherPayload(
  payload: Record<string, unknown>,
): payload is BatchedVoucherPayload {
  return (
    payload.type === "voucher" &&
    "channelConfig" in payload &&
    "channelId" in payload &&
    "maxClaimableAmount" in payload &&
    "signature" in payload
  );
}

/**
 * Type guard for a batch claim settle payload (facilitator calls `claim()`).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedClaimPayload}.
 */
export function isBatchedClaimPayload(
  payload: Record<string, unknown>,
): payload is BatchedClaimPayload {
  return payload.settleAction === "claim" && "claims" in payload;
}

/**
 * Type guard for a claim-with-signature settle payload (facilitator calls `claimWithSignature()`).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedClaimWithSignaturePayload}.
 */
export function isBatchedClaimWithSignaturePayload(
  payload: Record<string, unknown>,
): payload is BatchedClaimWithSignaturePayload {
  return (
    payload.settleAction === "claimWithSignature" &&
    "claims" in payload &&
    "authorizerSignature" in payload
  );
}

/**
 * Type guard for a settle action payload (transfers claimed funds to receiver).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedSettleActionPayload}.
 */
export function isBatchedSettleActionPayload(
  payload: Record<string, unknown>,
): payload is BatchedSettleActionPayload {
  return payload.settleAction === "settle" && "receiver" in payload && "token" in payload;
}

/**
 * Type guard for a msg.sender-gated refund settle payload
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedRefundPayload}.
 */
export function isBatchedRefundPayload(
  payload: Record<string, unknown>,
): payload is BatchedRefundPayload {
  return (
    payload.settleAction === "refund" &&
    "config" in payload &&
    !("receiverAuthorizerSignature" in payload)
  );
}

/**
 * Type guard for a signature-based refund settle payload
 * (server IS the receiverAuthorizer, signs off-chain).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedRefundWithSignaturePayload}.
 */
export function isBatchedRefundWithSignaturePayload(
  payload: Record<string, unknown>,
): payload is BatchedRefundWithSignaturePayload {
  return (
    payload.settleAction === "refundWithSignature" &&
    "config" in payload &&
    "receiverAuthorizerSignature" in payload
  );
}

/**
 * Type guard for a deposit-only settle envelope.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchedDepositSettlePayload}.
 */
export function isBatchedDepositSettlePayload(
  payload: Record<string, unknown>,
): payload is BatchedDepositSettlePayload {
  return payload.settleAction === "deposit" && "deposit" in payload;
}
