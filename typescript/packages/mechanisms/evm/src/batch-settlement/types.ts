export interface AuthorizerSigner {
  address: `0x${string}`;
  signTypedData(params: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
}

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

export type BatchSettlementErc3009Authorization = {
  validAfter: string;
  validBefore: string;
  salt: `0x${string}`;
  signature: `0x${string}`;
};

export type BatchSettlementDepositPayload = {
  type: "deposit";
  deposit: {
    channelConfig: ChannelConfig;
    amount: string;
    authorization: {
      erc3009Authorization?: BatchSettlementErc3009Authorization;
    };
  };
  voucher: BatchSettlementVoucherFields;
  responseExtra?: { chargedCumulativeAmount: string };
};

export type BatchSettlementVoucherPayload = {
  type: "voucher";
  channelConfig: ChannelConfig;
} & BatchSettlementVoucherFields;

export type BatchSettlementVoucherFields = {
  channelId: `0x${string}`;
  maxClaimableAmount: string;
  signature: `0x${string}`;
  refund?: boolean;
};

export type BatchSettlementVoucherClaim = {
  voucher: {
    channel: ChannelConfig;
    maxClaimableAmount: string;
  };
  signature: `0x${string}`;
  totalClaimed: string;
};

export type BatchSettlementPaymentResponseExtra = {
  channelId: `0x${string}`;
  chargedCumulativeAmount: string;
  balance: string;
  totalClaimed: string;
  withdrawRequestedAt: number;
  refundNonce: string;
  refund?: true;
};

export type BatchSettlementClaimWithSignaturePayload = {
  settleAction: "claimWithSignature";
  claims: BatchSettlementVoucherClaim[];
  claimAuthorizerSignature?: `0x${string}`;
};

export type BatchSettlementSettleActionPayload = {
  settleAction: "settle";
  receiver: `0x${string}`;
  token: `0x${string}`;
};

export type BatchSettlementDepositSettlePayload = {
  settleAction: "deposit";
  deposit: BatchSettlementDepositPayload["deposit"];
};

export type BatchSettlementRefundWithSignaturePayload = {
  settleAction: "refundWithSignature";
  config: ChannelConfig;
  amount: string;
  nonce: string;
  claims: BatchSettlementVoucherClaim[];
  refundAuthorizerSignature?: `0x${string}`;
  claimAuthorizerSignature?: `0x${string}`;
  responseExtra?: BatchSettlementPaymentResponseExtra;
};

export type BatchSettlementPayload = BatchSettlementDepositPayload | BatchSettlementVoucherPayload;

export type BatchSettlementSettlePayload =
  | BatchSettlementDepositSettlePayload
  | BatchSettlementClaimWithSignaturePayload
  | BatchSettlementSettleActionPayload
  | BatchSettlementRefundWithSignaturePayload;

/**
 * Type guard for a batched deposit payload (deposit + voucher).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchSettlementDepositPayload}.
 */
export function isBatchSettlementDepositPayload(
  payload: Record<string, unknown>,
): payload is BatchSettlementDepositPayload {
  return payload.type === "deposit" && "deposit" in payload && "voucher" in payload;
}

/**
 * Type guard for a batched voucher-only payload.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchSettlementVoucherPayload}.
 */
export function isBatchSettlementVoucherPayload(
  payload: Record<string, unknown>,
): payload is BatchSettlementVoucherPayload {
  return (
    payload.type === "voucher" &&
    "channelConfig" in payload &&
    "channelId" in payload &&
    "maxClaimableAmount" in payload &&
    "signature" in payload
  );
}

/**
 * Type guard for a claim-with-signature settle payload (facilitator calls `claimWithSignature()`).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchSettlementClaimWithSignaturePayload}.
 */
export function isBatchSettlementClaimWithSignaturePayload(
  payload: Record<string, unknown>,
): payload is BatchSettlementClaimWithSignaturePayload {
  return payload.settleAction === "claimWithSignature" && "claims" in payload;
}

/**
 * Type guard for a settle action payload (transfers claimed funds to receiver).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchSettlementSettleActionPayload}.
 */
export function isBatchSettlementSettleActionPayload(
  payload: Record<string, unknown>,
): payload is BatchSettlementSettleActionPayload {
  return payload.settleAction === "settle" && "receiver" in payload && "token" in payload;
}

/**
 * Type guard for a signature-based refund settle payload.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchSettlementRefundWithSignaturePayload}.
 */
export function isBatchSettlementRefundWithSignaturePayload(
  payload: Record<string, unknown>,
): payload is BatchSettlementRefundWithSignaturePayload {
  return payload.settleAction === "refundWithSignature" && "config" in payload;
}

/**
 * Type guard for a deposit-only settle envelope.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link BatchSettlementDepositSettlePayload}.
 */
export function isBatchSettlementDepositSettlePayload(
  payload: Record<string, unknown>,
): payload is BatchSettlementDepositSettlePayload {
  return payload.settleAction === "deposit" && "deposit" in payload;
}
