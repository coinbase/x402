import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import {
  injected,
  metaMask,
  coinbaseWallet,
  walletConnect,
} from "wagmi/connectors";

export const config = createConfig({
  chains: [base],
  connectors: [
    injected(),
    metaMask(),
    coinbaseWallet({ appName: "AnySpend" }),
    walletConnect({ projectId: "demo" }), // Use your own WalletConnect project ID in production
  ],
  transports: {
    [base.id]: http(),
  },
});

// Common ERC-20 tokens on Base network
export const BASE_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    eip712: {
      name: "USD Coin",
      version: "2",
    },
  },
  {
    symbol: "B3",
    name: "B3",
    address: "0xB3B32F9f8827D4634fE7d973Fa1034Ec9fdDB3B3",
    decimals: 18,
    eip712: {
      name: "B3",
      version: "1",
    },
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    decimals: 18,
    eip712: {
      name: "Dai Stablecoin",
      version: "1",
    },
  },
] as const;

export type Token = (typeof BASE_TOKENS)[number];
