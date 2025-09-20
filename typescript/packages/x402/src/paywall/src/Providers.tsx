import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { base, baseSepolia } from "viem/chains";

import { selectPaymentRequirements } from "../../client";
import type { Network, PaymentRequirements } from "../../types";
import "./window.d.ts";

type ProvidersProps = {
  children: ReactNode;
};

const AVM_NETWORKS = new Set(["algorand", "algorand-testnet"] as const);
/**
 * Resolves the most relevant `PaymentRequirements` for the current runtime configuration.
 *
 * @param config - The paywall runtime configuration
 * @returns The selected payment requirements or null if unavailable
 */
function resolvePrimaryRequirements(
  config: typeof window.x402 | undefined,
): PaymentRequirements | null {
  if (!config) {
    return null;
  }

  const candidates = config.testnet ? ["base-sepolia", "algorand-testnet"] : ["base", "algorand"];
  return selectPaymentRequirements(
    [config.paymentRequirements].flat() as PaymentRequirements[],
    candidates as Network[],
    "exact",
  );
}

/**
 * Providers component for the paywall
 *
 * @param props - The component props
 * @param props.children - The children of the Providers component
 * @returns The Providers component
 */
export function Providers({ children }: ProvidersProps) {
  const config = window.x402;
  const primaryRequirements = useMemo(() => resolvePrimaryRequirements(config), [config]);
  const isAvm = Boolean(
    primaryRequirements &&
      AVM_NETWORKS.has(primaryRequirements.network as "algorand" | "algorand-testnet"),
  );

  if (isAvm) {
    return <>{children}</>;
  }

  const { testnet, cdpClientKey, appName, appLogo } = config ?? {};

  return (
    <OnchainKitProvider
      apiKey={cdpClientKey || undefined}
      chain={(testnet ?? true) ? baseSepolia : base}
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
