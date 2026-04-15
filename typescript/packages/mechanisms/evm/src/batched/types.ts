export type ChannelConfig = {
  payer: `0x${string}`;
  payerAuthorizer: `0x${string}`;
  receiver: `0x${string}`;
  receiverAuthorizer: `0x${string}`;
  token: `0x${string}`;
  withdrawDelay: number;
  salt: `0x${string}`;
};

export type DeferredErc3009Authorization = {
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

export type DeferredDepositPayload = {
  type: "deposit";
  deposit: {
    channelConfig: ChannelConfig;
    amount: string;
    authorization: {
      erc3009Authorization?: DeferredErc3009Authorization;
    };
  };
  voucher: DeferredVoucherFields;
};

export type DeferredVoucherPayload = {
  type: "voucher";
  channelConfig: ChannelConfig;
} & DeferredVoucherFields;

export type DeferredVoucherFields = {
  channelId: `0x${string}`;
  maxClaimableAmount: string;
  signature: `0x${string}`;
  withdraw?: boolean;
};

export type DeferredVoucherClaim = {
  voucher: {
    channel: ChannelConfig;
    maxClaimableAmount: string;
  };
  signature: `0x${string}`;
  claimAmount: string;
};

export type DeferredClaimPayload = {
  settleAction: "claim";
  claims: DeferredVoucherClaim[];
};

export type DeferredClaimWithSignaturePayload = {
  settleAction: "claimWithSignature";
  claims: DeferredVoucherClaim[];
  authorizerSignature: `0x${string}`;
};

export type DeferredSettleActionPayload = {
  settleAction: "settle";
  receiver: `0x${string}`;
  token: `0x${string}`;
};

export type DeferredDepositSettlePayload = {
  settleAction: "deposit";
  deposit: DeferredDepositPayload["deposit"];
};

export type DeferredCooperativeWithdrawPayload = {
  settleAction: "cooperativeWithdraw";
  config: ChannelConfig;
  claims: DeferredVoucherClaim[];
};

export type DeferredCooperativeWithdrawWithSignaturePayload = {
  settleAction: "cooperativeWithdrawWithSignature";
  config: ChannelConfig;
  claims: DeferredVoucherClaim[];
  receiverAuthorizerSignature: `0x${string}`;
  claimAuthorizerSignature?: `0x${string}`;
};

export type DeferredPayload = DeferredDepositPayload | DeferredVoucherPayload;

export type DeferredSettlePayload =
  | DeferredDepositSettlePayload
  | DeferredClaimPayload
  | DeferredClaimWithSignaturePayload
  | DeferredSettleActionPayload
  | DeferredCooperativeWithdrawPayload
  | DeferredCooperativeWithdrawWithSignaturePayload;

/**
 * Type guard for a batch-settlement deposit payload (deposit + voucher).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredDepositPayload}.
 */
export function isDeferredDepositPayload(
  payload: Record<string, unknown>,
): payload is DeferredDepositPayload {
  return payload.type === "deposit" && "deposit" in payload && "voucher" in payload;
}

/**
 * Type guard for a batch-settlement voucher-only payload.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredVoucherPayload}.
 */
export function isDeferredVoucherPayload(
  payload: Record<string, unknown>,
): payload is DeferredVoucherPayload {
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
 * @returns True if the object matches {@link DeferredClaimPayload}.
 */
export function isDeferredClaimPayload(
  payload: Record<string, unknown>,
): payload is DeferredClaimPayload {
  return payload.settleAction === "claim" && "claims" in payload;
}

/**
 * Type guard for a claim-with-signature settle payload (facilitator calls `claimWithSignature()`).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredClaimWithSignaturePayload}.
 */
export function isDeferredClaimWithSignaturePayload(
  payload: Record<string, unknown>,
): payload is DeferredClaimWithSignaturePayload {
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
 * @returns True if the object matches {@link DeferredSettleActionPayload}.
 */
export function isDeferredSettleActionPayload(
  payload: Record<string, unknown>,
): payload is DeferredSettleActionPayload {
  return payload.settleAction === "settle" && "receiver" in payload && "token" in payload;
}

/**
 * Type guard for a msg.sender-gated cooperative withdraw settle payload
 * (facilitator IS the receiverAuthorizer).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredCooperativeWithdrawPayload}.
 */
export function isDeferredCooperativeWithdrawPayload(
  payload: Record<string, unknown>,
): payload is DeferredCooperativeWithdrawPayload {
  return (
    payload.settleAction === "cooperativeWithdraw" &&
    "config" in payload &&
    !("receiverAuthorizerSignature" in payload)
  );
}

/**
 * Type guard for a signature-based cooperative withdraw settle payload
 * (server IS the receiverAuthorizer, signs off-chain).
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredCooperativeWithdrawWithSignaturePayload}.
 */
export function isDeferredCooperativeWithdrawWithSignaturePayload(
  payload: Record<string, unknown>,
): payload is DeferredCooperativeWithdrawWithSignaturePayload {
  return (
    payload.settleAction === "cooperativeWithdrawWithSignature" &&
    "config" in payload &&
    "receiverAuthorizerSignature" in payload
  );
}

/**
 * Type guard for a deposit-only settle envelope.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredDepositSettlePayload}.
 */
export function isDeferredDepositSettlePayload(
  payload: Record<string, unknown>,
): payload is DeferredDepositSettlePayload {
  return payload.settleAction === "deposit" && "deposit" in payload;
}
