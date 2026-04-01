export const DEFERRED_ESCROW_ADDRESS = "0xc23131c54603Fb33DA9AeC98afbE8E4CE9Be6CFF" as const;

export const DEFERRED_ESCROW_DOMAIN = {
  name: "Deferred Escrow",
  version: "1",
} as const;

export const voucherTypes = {
  Voucher: [
    { name: "serviceId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "cumulativeAmount", type: "uint128" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

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
