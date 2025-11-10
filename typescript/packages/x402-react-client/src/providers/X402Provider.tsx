import React, { useMemo, useEffect, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import type { CreateConnectorFn, Config } from "wagmi";
import { base, baseSepolia, polygon, polygonAmoy, avalanche, avalancheFuji } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { injected, metaMask, coinbaseWallet as coinbase, walletConnect } from "wagmi/connectors";
import "@rainbow-me/rainbowkit/styles.css";
import { X402ProviderProps } from "../types";

const WagmiProviderCompat = WagmiProvider as React.FC<React.PropsWithChildren<{ config: Config }>>;

const DEFAULT_CHAINS = [base, baseSepolia, polygon, polygonAmoy, avalanche, avalancheFuji] as const;

// Prevents recreation on re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 30000,
      gcTime: 1000 * 60 * 60,
    },
  },
});

const configCache = new Map<string, Config>();

/**
 * Provider component that sets up wallet connectivity and blockchain configuration.
 *
 * Must wrap your entire app (or sections that need wallet access) to enable
 * x402 payment functionality. Configures wagmi, RainbowKit, and TanStack Query
 * with sensible defaults while allowing full customization.
 *
 * @param props - Component props containing children and optional config
 *
 * @example
 * Basic usage (RainbowKit UI with default chains):
 * ```tsx
 * import { X402Provider } from "@x402-react-client";
 * import { ConnectButton } from "@rainbow-me/rainbowkit";
 *
 * export default function App() {
 *   return (
 *     <X402Provider>
 *       <header>
 *         <ConnectButton />
 *       </header>
 *       <main>
 *         <YourApp />
 *       </main>
 *     </X402Provider>
 *   );
 * }
 * ```
 *
 * @example
 * With WalletConnect and custom app name:
 * ```tsx
 * <X402Provider
 *   config={{
 *     appName: "My DeFi Platform",
 *     walletConnectProjectId: "your_project_id_here"
 *   }}
 * >
 *   <App />
 * </X402Provider>
 * ```
 *
 * @example
 * Headless mode with custom wallet UI:
 * ```tsx
 * import { useConnect, useAccount } from "wagmi";
 *
 * function CustomConnectButton() {
 *   const { connect, connectors } = useConnect();
 *   const { isConnected } = useAccount();
 *
 *   return (
 *     <div>
 *       {!isConnected && (
 *         <button onClick={() => connect({ connector: connectors[0] })}>
 *           Connect Wallet
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 *
 * <X402Provider config={{ mode: "headless" }}>
 *   <CustomConnectButton />
 *   <App />
 * </X402Provider>
 * ```
 *
 * @example
 * Custom chains (mainnet only):
 * ```tsx
 * import { base, polygon, avalanche } from "wagmi/chains";
 *
 * <X402Provider
 *   config={{
 *     chains: [base, polygon, avalanche]
 *   }}
 * >
 *   <App />
 * </X402Provider>
 * ```
 *
 * @example
 * Custom theme:
 * ```tsx
 * import { lightTheme } from "@rainbow-me/rainbowkit";
 *
 * <X402Provider
 *   config={{
 *     rainbowKitTheme: lightTheme({
 *       accentColor: "#ff6b6b",
 *       accentColorForeground: "white",
 *       borderRadius: "small"
 *     })
 *   }}
 * >
 *   <App />
 * </X402Provider>
 * ```
 *
 * @example
 * Advanced: Custom connectors:
 * ```tsx
 * import { metaMask, coinbaseWallet, injected } from "wagmi/connectors";
 *
 * <X402Provider
 *   config={{
 *     connectors: [
 *       metaMask(),
 *       coinbaseWallet({ appName: "My App" }),
 *       injected({ target: "trust" })
 *     ]
 *   }}
 * >
 *   <App />
 * </X402Provider>
 * ```
 *
 * @remarks
 * Default Configuration:
 * - App Name: "x402 App"
 * - Chains: Base, Polygon, Avalanche (mainnet + testnets)
 * - Mode: RainbowKit UI
 * - Theme: Dark theme with blue accent
 * - Wallets: MetaMask, Coinbase Wallet, WalletConnect
 *
 * @remarks
 * When to use customWagmiConfig:
 * Only use this option if you need features not exposed by the provider's API,
 * such as custom transports, SSR configuration, or advanced wagmi plugins.
 * In most cases, the standard config options are sufficient.
 *
 * @remarks
 * Next.js App Router:
 * The "use client" directive is included, so this works seamlessly with
 * Next.js 13+ app directory. No additional configuration needed.
 *
 * @remarks
 * SSR Behavior:
 * This component only renders on the client side. During server-side rendering,
 * it returns null to prevent hydration mismatches and wallet-related errors.
 */
export function X402Provider({ children, config = {} }: X402ProviderProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    appName = "x402 App",
    walletConnectProjectId = "YOUR_PROJECT_ID",
    chains = DEFAULT_CHAINS,
    rainbowKitTheme,
    mode = "rainbowkit",
    connectors: customConnectors,
    customWagmiConfig,
  } = config;

  const wagmiConfig = useMemo(() => {
    if (!isMounted) return null;

    if (customWagmiConfig) {
      return customWagmiConfig;
    }

    const cacheKey = JSON.stringify({
      mode,
      appName,
      walletConnectProjectId,
      chainIds: chains.map(c => c.id).sort(),
      hasCustomConnectors: !!customConnectors,
    });

    if (configCache.has(cacheKey)) {
      return configCache.get(cacheKey)!;
    }

    let connectorsList: CreateConnectorFn[];

    if (customConnectors) {
      // User provided custom connectors - use them directly
      connectorsList = customConnectors;
    } else if (mode === "rainbowkit") {
      // RainbowKit mode - use RainbowKit's connector builder
      const rainbowConnectors = connectorsForWallets(
        [
          {
            groupName: "Recommended",
            wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet],
          },
        ],
        {
          appName,
          projectId: walletConnectProjectId,
        },
      );
      connectorsList = rainbowConnectors as any as CreateConnectorFn[];
    } else {
      // Headless mode - use basic wagmi connectors
      connectorsList = [
        injected() as any,
        metaMask() as any,
        coinbase({ appName }) as any,
      ] as CreateConnectorFn[];

      if (walletConnectProjectId && walletConnectProjectId !== "YOUR_PROJECT_ID") {
        connectorsList.push(walletConnect({ projectId: walletConnectProjectId }) as any);
      }
    }

    const newConfig = createConfig({
      chains,
      transports: Object.fromEntries(chains.map(chain => [chain.id, http()])),
      connectors: connectorsList,
      ssr: true,
    });

    configCache.set(cacheKey, newConfig);
    return newConfig;
  }, [
    isMounted,
    mode,
    customConnectors,
    chains,
    appName,
    walletConnectProjectId,
    customWagmiConfig,
  ]);

  const theme = useMemo(
    () =>
      rainbowKitTheme ||
      darkTheme({
        accentColor: "#3b82f6",
        borderRadius: "medium",
      }),
    [rainbowKitTheme],
  );

  if (!isMounted || !wagmiConfig) {
    return null;
  }

  return (
    <WagmiProviderCompat config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {mode === "rainbowkit" ? (
          <RainbowKitProvider theme={theme} modalSize="compact">
            {children}
          </RainbowKitProvider>
        ) : (
          children
        )}
      </QueryClientProvider>
    </WagmiProviderCompat>
  );
}
