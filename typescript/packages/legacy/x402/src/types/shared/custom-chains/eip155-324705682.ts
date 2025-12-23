import { type Chain } from "viem";

// This chain isactive and is waiting for addition to https://github.com/ethereum-lists/chains
// before it can be added to wevm/viem/chains.
export const skalekairos = {
  id: 324705682,
  name: "SKALE Base Sepolia",
  nativeCurrency: {
    name: "Credits",
    symbol: "CREDITS",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://kairos-testnet-testnet.skalenodes.com/v1/jubilant-horrible-ancha"],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://kairos-testnet-testnet-explorer.skalenodes.com",
      apiUrl: "https://kairos-testnet-testnet-explorer.skalenodes.com/api",
    },
  },
} satisfies Chain;
