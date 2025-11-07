import { http, createConfig } from "wagmi";
import {
  base,
  mainnet,
  polygon,
  arbitrum,
  optimism,
  avalanche,
  bsc,
} from "wagmi/chains";
import {
  injected,
  metaMask,
  coinbaseWallet,
  walletConnect,
} from "wagmi/connectors";

// Type declarations for Binance wallet providers
interface BinanceChainProvider {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
  isBinance?: boolean;
  isBNBSmartWallet?: boolean;
}

interface ExtendedWindow extends Window {
  BinanceChain?: BinanceChainProvider;
  ethereum?: BinanceChainProvider & { [key: string]: unknown };
}

export const config = createConfig({
  chains: [base, mainnet, polygon, arbitrum, optimism, avalanche, bsc],
  connectors: [
    injected({
      target() {
        return {
          id: "binance",
          name: "Binance Wallet",
          provider(window) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (window as ExtendedWindow)?.BinanceChain as any;
          },
        };
      },
    }),
    injected({
      target() {
        return {
          id: "bnbSmartWallet",
          name: "BNB Smart Wallet",
          provider(window) {
            // BNB Smart Wallet uses the ethereum provider with specific detection
            const eth = (window as ExtendedWindow)?.ethereum;
            if (eth?.isBinance || eth?.isBNBSmartWallet) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return eth as any;
            }
            return undefined;
          },
        };
      },
    }),
    injected(),
    metaMask(),
    coinbaseWallet({ appName: "AnySpend" }),
    walletConnect({ projectId: "demo" }), // Use your own WalletConnect project ID in production
  ],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [avalanche.id]: http(),
    [bsc.id]: http(),
  },
});

// Common ERC-20 tokens on Base network that support ERC-2612 permit
export const BASE_TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    icon: "💵",
    eip712: {
      name: "USD Coin",
      version: "2",
    },
  },
  {
    symbol: "B3",
    name: "B3 Token",
    address: "0xB3B32F9f8827D4634fE7d973Fa1034Ec9fdDB3B3",
    decimals: 18,
    icon: "🟢",
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
    icon: "🟡",
    eip712: {
      name: "Dai Stablecoin",
      version: "1",
    },
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    decimals: 6,
    icon: "🟢",
    eip712: {
      name: "Tether USD",
      version: "1",
    },
  },
] as const;

export type Token = (typeof BASE_TOKENS)[number];
