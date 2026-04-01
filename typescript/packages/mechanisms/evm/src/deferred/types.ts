export type DeferredErc3009Authorization = {
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

export type DeferredDepositPayload = {
  type: "deposit";
  deposit: {
    serviceId: `0x${string}`;
    payer: `0x${string}`;
    amount: string;
    authorization: {
      erc3009Authorization?: DeferredErc3009Authorization;
    };
  };
  voucher: DeferredVoucherFields;
};

export type DeferredVoucherPayload = {
  type: "voucher";
} & DeferredVoucherFields;

export type DeferredVoucherFields = {
  serviceId: `0x${string}`;
  payer: `0x${string}`;
  cumulativeAmount: string;
  nonce: number;
  signature: `0x${string}`;
};

export type DeferredClaimPayload = {
  settleAction: "claim";
  serviceId: `0x${string}`;
  claims: DeferredVoucherClaim[];
};

export type DeferredSettleActionPayload = {
  settleAction: "settle";
  serviceId: `0x${string}`;
};

export type DeferredDepositSettlePayload = {
  settleAction: "deposit";
  deposit: DeferredDepositPayload["deposit"];
};

export type DeferredVoucherClaim = {
  payer: `0x${string}`;
  cumulativeAmount: string;
  claimAmount: string;
  nonce: number;
  signature: `0x${string}`;
};

export type DeferredPayload = DeferredDepositPayload | DeferredVoucherPayload;

export type DeferredSettlePayload =
  | DeferredDepositSettlePayload
  | DeferredClaimPayload
  | DeferredSettleActionPayload;

/**
 * Type guard for a deferred deposit payload (deposit + voucher).
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
 * Type guard for a deferred voucher-only payload.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredVoucherPayload}.
 */
export function isDeferredVoucherPayload(
  payload: Record<string, unknown>,
): payload is DeferredVoucherPayload {
  return (
    payload.type === "voucher" &&
    "serviceId" in payload &&
    "cumulativeAmount" in payload &&
    "signature" in payload
  );
}

/**
 * Type guard for a batch claim settle payload.
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
 * Type guard for a service settle action payload.
 *
 * @param payload - The raw payload object.
 * @returns True if the object matches {@link DeferredSettleActionPayload}.
 */
export function isDeferredSettleActionPayload(
  payload: Record<string, unknown>,
): payload is DeferredSettleActionPayload {
  return payload.settleAction === "settle" && "serviceId" in payload;
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
