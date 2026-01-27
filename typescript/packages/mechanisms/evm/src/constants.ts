// EIP-3009 TransferWithAuthorization types for EIP-712 signing
export const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// EIP3009 ABI for transferWithAuthorization function
export const eip3009ABI = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "version",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * x402ExactPermit2Proxy contract address
 * Vanity address: 0x4020...0001 for easy recognition.
 * This address is deterministic based on:
 * - Arachnid's deterministic deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
 * - Vanity-mined salt for prefix 0x4020 and suffix 0001
 * - Contract bytecode + constructor args (PERMIT2_ADDRESS)
 */
export const x402ExactPermit2ProxyAddress = "0x4020B671C4c523a852c11a5EC58F27F235e80001" as const;

/**
 * x402UptoPermit2Proxy contract address
 * Vanity address: 0x4020...0002 for easy recognition.
 * This address is deterministic based on:
 * - Arachnid's deterministic deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
 * - Vanity-mined salt for prefix 0x4020 and suffix 0002
 * - Contract bytecode + constructor args (PERMIT2_ADDRESS)
 */
export const x402UptoPermit2ProxyAddress = "0x40209D7168c33Fbb5E6EccF6f00a3D54A52f0002" as const;

/**
 * Canonical Permit2 contract address
 * Same address on all EVM chains via CREATE2 deployment
 *
 * @see https://github.com/Uniswap/permit2
 */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/**
 * x402Permit2Proxy ABI
 */
export const x402ExactPermit2ProxyABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_permit2",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "PERMIT2",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract ISignatureTransfer",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "WITNESS_TYPEHASH",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "WITNESS_TYPE_STRING",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "settle",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        internalType: "struct ISignatureTransfer.PermitTransferFrom",
        components: [
          {
            name: "permitted",
            type: "tuple",
            internalType: "struct ISignatureTransfer.TokenPermissions",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address",
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "witness",
        type: "tuple",
        internalType: "struct x402BasePermit2Proxy.Witness",
        components: [
          {
            name: "to",
            type: "address",
            internalType: "address",
          },
          {
            name: "validAfter",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "validBefore",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "extra",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settleWithPermit",
    inputs: [
      {
        name: "permit2612",
        type: "tuple",
        internalType: "struct x402BasePermit2Proxy.EIP2612Permit",
        components: [
          {
            name: "value",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "r",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "s",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "v",
            type: "uint8",
            internalType: "uint8",
          },
        ],
      },
      {
        name: "permit",
        type: "tuple",
        internalType: "struct ISignatureTransfer.PermitTransferFrom",
        components: [
          {
            name: "permitted",
            type: "tuple",
            internalType: "struct ISignatureTransfer.TokenPermissions",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address",
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "witness",
        type: "tuple",
        internalType: "struct x402BasePermit2Proxy.Witness",
        components: [
          {
            name: "to",
            type: "address",
            internalType: "address",
          },
          {
            name: "validAfter",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "validBefore",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "extra",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Settled",
    inputs: [],
    anonymous: false,
  },
  {
    type: "event",
    name: "SettledWithPermit",
    inputs: [],
    anonymous: false,
  },
  {
    type: "error",
    name: "InvalidDestination",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPermit2Address",
    inputs: [],
  },
  {
    type: "error",
    name: "PaymentExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "PaymentTooEarly",
    inputs: [],
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: [],
  },
] as const;

export const x402UptoPermit2ProxyABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_permit2",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "PERMIT2",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract ISignatureTransfer",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "WITNESS_TYPEHASH",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "WITNESS_TYPE_STRING",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "settle",
    inputs: [
      {
        name: "permit",
        type: "tuple",
        internalType: "struct ISignatureTransfer.PermitTransferFrom",
        components: [
          {
            name: "permitted",
            type: "tuple",
            internalType: "struct ISignatureTransfer.TokenPermissions",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address",
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "witness",
        type: "tuple",
        internalType: "struct x402BasePermit2Proxy.Witness",
        components: [
          {
            name: "to",
            type: "address",
            internalType: "address",
          },
          {
            name: "validAfter",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "validBefore",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "extra",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "settleWithPermit",
    inputs: [
      {
        name: "permit2612",
        type: "tuple",
        internalType: "struct x402BasePermit2Proxy.EIP2612Permit",
        components: [
          {
            name: "value",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "r",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "s",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "v",
            type: "uint8",
            internalType: "uint8",
          },
        ],
      },
      {
        name: "permit",
        type: "tuple",
        internalType: "struct ISignatureTransfer.PermitTransferFrom",
        components: [
          {
            name: "permitted",
            type: "tuple",
            internalType: "struct ISignatureTransfer.TokenPermissions",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address",
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "deadline",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "witness",
        type: "tuple",
        internalType: "struct x402BasePermit2Proxy.Witness",
        components: [
          {
            name: "to",
            type: "address",
            internalType: "address",
          },
          {
            name: "validAfter",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "validBefore",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "extra",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Settled",
    inputs: [],
    anonymous: false,
  },
  {
    type: "event",
    name: "SettledWithPermit",
    inputs: [],
    anonymous: false,
  },
  {
    type: "error",
    name: "AmountExceedsPermitted",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidDestination",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidOwner",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidPermit2Address",
    inputs: [],
  },
  {
    type: "error",
    name: "PaymentExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "PaymentTooEarly",
    inputs: [],
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: [],
  },
] as const;
