/**
 * Asset transfer methods for the exact EVM scheme.
 * - eip3009: Uses transferWithAuthorization (USDC, etc.) - recommended for compatible tokens
 * - permit2: Uses Permit2 + x402Permit2Proxy - universal fallback for any ERC-20
 */
export type AssetTransferMethod = "eip3009" | "permit2";

/**
 * EIP-3009 payload for tokens with native transferWithAuthorization support.
 */
export type ExactEIP3009Payload = {
  signature?: `0x${string}`;
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
  };
};

/**
 * Permit2 witness data structure.
 * Matches the Witness struct in x402Permit2Proxy contract.
 * Note: Upper time bound is enforced by Permit2's `deadline` field, not a witness field.
 */
export type Permit2Witness = {
  to: `0x${string}`;
  validAfter: string;
};

/**
 * Permit2 authorization parameters.
 * Used to reconstruct the signed message for verification.
 */
export type Permit2Authorization = {
  permitted: {
    token: `0x${string}`;
    amount: string;
  };
  spender: `0x${string}`;
  nonce: string;
  deadline: string;
  witness: Permit2Witness;
};

/**
 * Permit2 payload for tokens using the Permit2 + x402Permit2Proxy flow.
 */
export type ExactPermit2Payload = {
  signature: `0x${string}`;
  permit2Authorization: Permit2Authorization & {
    from: `0x${string}`;
  };
};

export type ExactEvmPayloadV1 = ExactEIP3009Payload;

export type ExactEvmPayloadV2 = ExactEIP3009Payload | ExactPermit2Payload;

/**
 * Type guard to check if a payload is a Permit2 payload.
 * Permit2 payloads have a `permit2Authorization` field.
 *
 * @param payload - The payload to check.
 * @returns True if the payload is a Permit2 payload, false otherwise.
 */
export function isPermit2Payload(payload: ExactEvmPayloadV2): payload is ExactPermit2Payload {
  return "permit2Authorization" in payload;
}

/**
 * Type guard to check if a payload is an EIP-3009 payload.
 * EIP-3009 payloads have an `authorization` field.
 *
 * @param payload - The payload to check.
 * @returns True if the payload is an EIP-3009 payload, false otherwise.
 */
export function isEIP3009Payload(payload: ExactEvmPayloadV2): payload is ExactEIP3009Payload {
  return "authorization" in payload;
}

/**
 * Upto Permit2 witness — includes `facilitator` field absent from exact witness.
 * Only the address matching `witness.facilitator` can call settle() on-chain.
 */
export type UptoPermit2Witness = {
  to: `0x${string}`;
  facilitator: `0x${string}`;
  validAfter: string;
};

export type UptoPermit2Authorization = {
  permitted: {
    token: `0x${string}`;
    amount: string;
  };
  spender: `0x${string}`;
  nonce: string;
  deadline: string;
  witness: UptoPermit2Witness;
};

export type UptoPermit2Payload = {
  signature: `0x${string}`;
  permit2Authorization: UptoPermit2Authorization & {
    from: `0x${string}`;
  };
};

/** Upto ERC-3009 authorization signed with ReceiveWithAuthorization. */
export type UptoEIP3009Payload = {
  signature: `0x${string}`;
  authorization: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
  };
  paymentInfo: {
    payTo: `0x${string}`;
    settler: `0x${string}`;
    salt: `0x${string}`;
  };
};

export type UptoEvmPayloadV2 = UptoEIP3009Payload | UptoPermit2Payload;

// Batch-settlement EVM scheme payload types
export type {
  AuthorizerSigner,
  ChannelConfig,
  ChannelState,
  BatchSettlementDepositPayload,
  BatchSettlementVoucherPayload,
  BatchSettlementRefundPayload,
  BatchSettlementVoucherFields,
  BatchSettlementErc3009Authorization,
  BatchSettlementPermit2Authorization,
  BatchSettlementDepositAuthorization,
  BatchSettlementAssetTransferMethod,
  BatchSettlementClaimPayload,
  BatchSettlementEnrichedRefundPayload,
  BatchSettlementVoucherClaim,
  BatchSettlementPayload,
  BatchSettlementSettlePayload,
  BatchSettlementFacilitatorSettlePayload,
  BatchSettlementPaymentRequirementsExtra,
  BatchSettlementPaymentResponseExtra,
} from "./batch-settlement/types";
export {
  isBatchSettlementDepositPayload,
  isBatchSettlementVoucherPayload,
  isBatchSettlementRefundPayload,
  isBatchSettlementClaimPayload,
  isBatchSettlementSettlePayload,
  isBatchSettlementEnrichedRefundPayload,
} from "./batch-settlement/types";

/**
 * Type guard to check if a payload is an upto Permit2 payload.
 * Validates structural presence of all required fields: signature, permit2Authorization
 * (with from, permitted, spender, nonce, deadline), and a witness containing facilitator.
 *
 * @param payload - The payload to check.
 * @returns True if the payload is an upto Permit2 payload, false otherwise.
 */
export function isUptoPermit2Payload(
  payload: Record<string, unknown>,
): payload is UptoPermit2Payload {
  if (typeof payload !== "object" || payload === null) return false;
  if (typeof payload.signature !== "string") return false;
  if ("authorization" in payload || "paymentInfo" in payload) return false;
  if (!("permit2Authorization" in payload)) return false;

  const auth = payload.permit2Authorization;
  if (typeof auth !== "object" || auth === null) return false;

  const a = auth as Record<string, unknown>;
  if (typeof a.from !== "string") return false;
  if (typeof a.spender !== "string") return false;
  if (typeof a.nonce !== "string") return false;
  if (typeof a.deadline !== "string") return false;

  const permitted = a.permitted;
  if (typeof permitted !== "object" || permitted === null) return false;
  const p = permitted as Record<string, unknown>;
  if (typeof p.token !== "string") return false;
  if (typeof p.amount !== "string") return false;

  const witness = a.witness;
  if (typeof witness !== "object" || witness === null) return false;
  const w = witness as Record<string, unknown>;
  return (
    typeof w.facilitator === "string" &&
    typeof w.to === "string" &&
    typeof w.validAfter === "string"
  );
}

/**
 * Type guard for the upto ERC-3009 payload.
 *
 * The ERC-3009 and Permit2 payload shapes are mutually exclusive. A payload
 * containing fields from both paths is rejected instead of selecting one.
 *
 * @param payload - The payload to check.
 * @returns True when the payload is exclusively a complete upto ERC-3009 payload.
 */
export function isUptoEIP3009Payload(
  payload: Record<string, unknown>,
): payload is UptoEIP3009Payload {
  if (typeof payload !== "object" || payload === null) return false;
  if (typeof payload.signature !== "string") return false;
  if ("permit2Authorization" in payload) return false;

  const authorization = payload.authorization;
  if (typeof authorization !== "object" || authorization === null) return false;
  const auth = authorization as Record<string, unknown>;
  if (
    typeof auth.from !== "string" ||
    typeof auth.to !== "string" ||
    typeof auth.value !== "string" ||
    typeof auth.validAfter !== "string" ||
    typeof auth.validBefore !== "string" ||
    typeof auth.nonce !== "string"
  ) {
    return false;
  }

  const paymentInfo = payload.paymentInfo;
  if (typeof paymentInfo !== "object" || paymentInfo === null) return false;
  const info = paymentInfo as Record<string, unknown>;
  return (
    typeof info.payTo === "string" &&
    typeof info.settler === "string" &&
    typeof info.salt === "string"
  );
}
