/** Deployed address of the x402BatchSettlement contract. */
export const BATCH_SETTLEMENT_ADDRESS = "0x4020cfaffad9df99f9acc48227c40f80d17a0003" as const;

/** EIP-712 domain fields shared across all batch-settlement typed-data signatures. */
export const BATCH_SETTLEMENT_DOMAIN = {
  name: "x402 Batch Settlement",
  version: "1",
} as const;

/** EIP-712 type definition for a cumulative voucher: `Voucher(bytes32 channelId, uint128 maxClaimableAmount)`. */
export const voucherTypes = {
  Voucher: [
    { name: "channelId", type: "bytes32" },
    { name: "maxClaimableAmount", type: "uint128" },
  ],
} as const;

/** EIP-712 type definition for cooperative withdrawal: `CooperativeWithdraw(bytes32 channelId)`. */
export const cooperativeWithdrawTypes = {
  CooperativeWithdraw: [{ name: "channelId", type: "bytes32" }],
} as const;

/** EIP-712 type definition for a receiver-authorizer claim batch: `ClaimBatch(bytes32 claimsHash)`. */
export const claimBatchTypes = {
  ClaimBatch: [{ name: "claimsHash", type: "bytes32" }],
} as const;

/** EIP-712 type definition for ERC-3009 `ReceiveWithAuthorization` (used for gasless deposits). */
export const receiveAuthorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;
