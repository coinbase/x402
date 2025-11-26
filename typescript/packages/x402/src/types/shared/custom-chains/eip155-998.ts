import { type Chain } from "viem";

export const hyperliquidEvmTestnet = {
  id: 998,
  name: "Hyperliquid EVM Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.hyperliquid-testnet.xyz/evm"],
    },
  },
  testnet: true,

} satisfies Chain;