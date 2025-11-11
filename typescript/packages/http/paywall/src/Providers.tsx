import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";
import { base, baseSepolia } from "viem/chains";

import { isEvmNetwork, EVM_CHAIN_IDS } from "./paywallUtils";

type ProvidersProps = {
  children: ReactNode;
};

/**
 * Providers component for the paywall
 *
 * @param props - The component props
 * @param props.children - The children of the Providers component
 * @returns The Providers component
 */
export function Providers({ children }: ProvidersProps) {
  const { cdpClientKey, appName, appLogo, paymentRequired } = window.x402;

  if (!paymentRequired?.accepts?.[0]) {
    return <>{children}</>;
  }

  const firstRequirement = paymentRequired.accepts[0];
  const network = firstRequirement.network;

  if (!isEvmNetwork(network)) {
    return <>{children}</>;
  }

  const chainId = network.split(":")[1];
  const isBaseSepolia = chainId === EVM_CHAIN_IDS.BASE_SEPOLIA;
  const chain = isBaseSepolia ? baseSepolia : base;

  return (
    <OnchainKitProvider
      apiKey={cdpClientKey || undefined}
      chain={chain}
      config={{
        appearance: {
          mode: "light",
          theme: "base",
          name: appName || undefined,
          logo: appLogo || undefined,
        },
        wallet: {
          display: "modal",
          supportedWallets: {
            rabby: true,
            trust: true,
            frame: true,
          },
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
