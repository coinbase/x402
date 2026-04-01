export const deferredEscrowABI = [
  {
    type: "function",
    name: "depositWithERC3009",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      {
        name: "claims",
        type: "tuple[]",
        components: [
          { name: "payer", type: "address" },
          { name: "cumulativeAmount", type: "uint128" },
          { name: "claimAmount", type: "uint128" },
          { name: "nonce", type: "uint64" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settle",
    inputs: [{ name: "serviceId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "register",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "payTo", type: "address" },
      { name: "token", type: "address" },
      { name: "authorizer", type: "address" },
      { name: "withdrawWindow", type: "uint64" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "addAuthorizer",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "newAuthorizer", type: "address" },
      { name: "authSignature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeAuthorizer",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "target", type: "address" },
      { name: "authSignature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updatePayTo",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "newPayTo", type: "address" },
      { name: "authSignature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updateWithdrawWindow",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "newWindow", type: "uint64" },
      { name: "authSignature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestWithdrawal",
    inputs: [{ name: "serviceId", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestWithdrawalFor",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "authorization", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "payer", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getService",
    inputs: [{ name: "serviceId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "withdrawWindow", type: "uint64" },
          { name: "registered", type: "bool" },
          { name: "payTo", type: "address" },
          { name: "unsettled", type: "uint128" },
          { name: "adminNonce", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSubchannel",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "payer", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "deposit", type: "uint128" },
          { name: "totalClaimed", type: "uint128" },
          { name: "nonce", type: "uint64" },
          { name: "withdrawRequestedAt", type: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isAuthorizer",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "domainSeparator",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getVoucherDigest",
    inputs: [
      { name: "serviceId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "cumulativeAmount", type: "uint128" },
      { name: "nonce", type: "uint64" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;

export const erc20BalanceOfABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
