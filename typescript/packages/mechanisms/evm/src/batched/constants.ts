/** Deployed address of the x402BatchSettlement contract. */
export const BATCH_SETTLEMENT_ADDRESS = "0x4020e07E964De72a79367828c9C6140fcaE00003" as const;

/** Deployed address of the ERC3009DepositCollector contract. */
export const ERC3009_DEPOSIT_COLLECTOR_ADDRESS =
  "0x402064ac4dA4f510EeC7D71fDc23A7D47fb10004" as const;

/** Minimum withdraw delay in seconds (15 minutes), matching the on-chain constant. */
export const MIN_WITHDRAW_DELAY = 900;

/** Maximum withdraw delay in seconds (30 days), matching the on-chain constant. */
export const MAX_WITHDRAW_DELAY = 2_592_000;

/** EIP-712 domain fields shared across all batched typed-data signatures. */
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

/** EIP-712 type definition for cooperative refund: `Refund(bytes32 channelId, uint256 nonce, uint128 amount)`. */
export const refundTypes = {
  Refund: [
    { name: "channelId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "amount", type: "uint128" },
  ],
} as const;

/** EIP-712 type definitions for a receiver-authorizer claim batch (nested ClaimEntry). */
export const claimBatchTypes = {
  ClaimBatch: [{ name: "claims", type: "ClaimEntry[]" }],
  ClaimEntry: [
    { name: "channelId", type: "bytes32" },
    { name: "maxClaimableAmount", type: "uint128" },
    { name: "totalClaimed", type: "uint128" },
  ],
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
