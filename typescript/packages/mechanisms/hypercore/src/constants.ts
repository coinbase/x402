export const HYPERLIQUID_API_URLS = {
  mainnet: "https://api.hyperliquid.xyz",
  testnet: "https://api.hyperliquid-testnet.xyz",
} as const;

export const HYPERCORE_NETWORKS = {
  mainnet: "hypercore:mainnet",
  testnet: "hypercore:testnet",
} as const;

export const HYPERCORE_EIP712_DOMAIN = {
  name: "HyperliquidSignTransaction",
  version: "1",
  chainId: 999n,
  verifyingContract: "0x0000000000000000000000000000000000000000" as const,
} as const;

export const HYPERCORE_EIP712_TYPES = {
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

export type HypercoreAssetInfo = {
  token: string;
  name: string;
  decimals: number;
};

export type HypercoreNetworkConfig = {
  defaultAsset: HypercoreAssetInfo;
};

export const HYPERCORE_NETWORK_CONFIGS: Record<string, HypercoreNetworkConfig> = {
  "hypercore:mainnet": {
    defaultAsset: {
      token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
      name: "USDH",
      decimals: 8,
    },
  },
  "hypercore:testnet": {
    defaultAsset: {
      token: "USDH:0x471fd4480bb9943a1fe080ab0d4ff36c",
      name: "USDH",
      decimals: 8,
    },
  },
} as const;

export const HYPERCORE_API_URLS_BY_NETWORK: Record<string, string> = {
  "hypercore:mainnet": HYPERLIQUID_API_URLS.mainnet,
  "hypercore:testnet": HYPERLIQUID_API_URLS.testnet,
} as const;

export const MAX_NONCE_AGE_MS = 3600000;

export const TX_HASH_LOOKUP = {
  maxRetries: 2,
  retryDelay: 500,
  lookbackWindow: 5000,
} as const;
