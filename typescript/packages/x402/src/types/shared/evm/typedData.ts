export const typedDataTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
  Voucher: [
    { name: "id", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "valueAggregate", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "escrow", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  DepositAuthorization: [
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
  FlushAuthorization: [
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "asset", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
  FlushAllAuthorization: [
    { name: "buyer", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
};

export const transferWithAuthorizationPrimaryType = "TransferWithAuthorization" as const;
export const deferredVoucherPrimaryType = "Voucher" as const;
export const permitPrimaryType = "Permit" as const;
export const depositAuthorizationPrimaryType = "DepositAuthorization" as const;
export const flushAuthorizationPrimaryType = "FlushAuthorization" as const;
export const flushAllAuthorizationPrimaryType = "FlushAllAuthorization" as const;
