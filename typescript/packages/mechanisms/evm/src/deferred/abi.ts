export const channelConfigComponents = [
  { name: "payer", type: "address" },
  { name: "payerAuthorizer", type: "address" },
  { name: "receiver", type: "address" },
  { name: "receiverAuthorizer", type: "address" },
  { name: "token", type: "address" },
  { name: "withdrawDelay", type: "uint40" },
  { name: "salt", type: "bytes32" },
] as const;

const voucherClaimComponents = [
  {
    name: "voucher",
    type: "tuple",
    components: [
      {
        name: "channel",
        type: "tuple",
        components: channelConfigComponents,
      },
      { name: "maxClaimableAmount", type: "uint128" },
    ],
  },
  { name: "signature", type: "bytes" },
  { name: "claimAmount", type: "uint128" },
] as const;

export const batchSettlementABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "config", type: "tuple", components: channelConfigComponents },
      { name: "amount", type: "uint128" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "depositWithERC3009",
    inputs: [
      { name: "config", type: "tuple", components: channelConfigComponents },
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
    name: "depositWithPermit2",
    inputs: [
      { name: "config", type: "tuple", components: channelConfigComponents },
      {
        name: "permit",
        type: "tuple",
        components: [
          {
            name: "permitted",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "voucherClaims", type: "tuple[]", components: voucherClaimComponents }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimWithSignature",
    inputs: [
      { name: "voucherClaims", type: "tuple[]", components: voucherClaimComponents },
      { name: "authorizerSignature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settle",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initiateWithdraw",
    inputs: [
      { name: "config", type: "tuple", components: channelConfigComponents },
      { name: "amount", type: "uint128" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "finalizeWithdraw",
    inputs: [{ name: "config", type: "tuple", components: channelConfigComponents }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cooperativeWithdraw",
    inputs: [{ name: "config", type: "tuple", components: channelConfigComponents }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cooperativeWithdrawWithSignature",
    inputs: [
      { name: "config", type: "tuple", components: channelConfigComponents },
      { name: "receiverAuthorizerSignature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getChannelId",
    inputs: [{ name: "config", type: "tuple", components: channelConfigComponents }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getChannel",
    inputs: [{ name: "channelId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "balance", type: "uint128" },
          { name: "totalClaimed", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPendingWithdrawal",
    inputs: [{ name: "channelId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint128" },
          { name: "initiatedAt", type: "uint40" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReceiver",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalClaimed", type: "uint128" },
          { name: "totalSettled", type: "uint128" },
        ],
      },
    ],
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
      { name: "channelId", type: "bytes32" },
      { name: "maxClaimableAmount", type: "uint128" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCooperativeWithdrawDigest",
    inputs: [{ name: "channelId", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getClaimBatchDigest",
    inputs: [{ name: "voucherClaims", type: "tuple[]", components: voucherClaimComponents }],
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
