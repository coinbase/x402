import { type Chain } from "viem";

// This chain isactive and is waiting for addition to https://github.com/ethereum-lists/chains
// before it can be added to wevm/viem/chains.
export const skaleBase = {
  id: 1562508942,
  name: "SKALE Base",
  nativeCurrency: {
    name: "Credits",
    symbol: "CREDITS",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://skale-base.skalenodes.com/v1/base"],
      webSocket: ["wss://skale-base.skalenodes.com/v1/ws/base"]
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://skale-base-explorer.skalenodes.com",
      apiUrl: "https://skale-base-explorer.skalenodes.com/api",
    },
  },
  blockTime: 1
} satisfies Chain;