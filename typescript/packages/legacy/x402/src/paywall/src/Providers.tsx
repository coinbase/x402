import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";
import { base, baseSepolia } from "viem/chains";

import {
  assertValidProviderConfig,
  choosePaymentRequirement,
  isEvmNetwork,
  validateProviderConfig,
} from "./paywallUtils";
import "./window.d.ts";

type ProvidersProps = {
  children: ReactNode;
};

/**
 * Error boundary fallback component for configuration errors.
 *
 * @param root0 - The component props
 * @param root0.errors - Array of error messages to display
 * @returns A React element displaying the configuration errors
 */
function ConfigurationError({ errors }: { errors: string[] }) {
  return (
    <div
      style={{
        padding: "20px",
        margin: "20px",
        border: "1px solid #dc2626",
        borderRadius: "8px",
        backgroundColor: "#fef2f2",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h2 style={{ color: "#dc2626", margin: "0 0 16px 0" }}>x402 Configuration Error</h2>
      <p style={{ color: "#7f1d1d", margin: "0 0 12px 0" }}>
        The OnchainKitProvider could not be initialized due to configuration issues:
      </p>
      <ul style={{ color: "#7f1d1d", margin: "0 0 16px 0", paddingLeft: "20px" }}>
        {errors.map((error, i) => (
          <li key={i} style={{ marginBottom: "8px" }}>
            {error}
          </li>
        ))}
      </ul>
      <p style={{ color: "#7f1d1d", margin: 0, fontSize: "14px" }}>
        See documentation:{" "}
        <a
          href="https://github.com/coinbase/x402#provider-configuration"
          style={{ color: "#2563eb" }}
        >
          https://github.com/coinbase/x402#provider-configuration
        </a>
      </p>
    </div>
  );
}

/**
 * Providers component for the paywall.
 *
 * Wraps children with OnchainKitProvider for EVM networks. Performs early
 * configuration validation and surfaces clear error messages if the
 * configuration is invalid.
 *
 * Required configuration (via window.x402):
 * - `paymentRequirements`: Payment requirements object or array
 * - `cdpClientKey`: CDP API key for OnchainKit (get one at https://portal.cdp.coinbase.com/)
 *
 * Optional configuration:
 * - `appName`: Application name shown in wallet prompts
 * - `appLogo`: Application logo URL
 * - `testnet`: Whether to use testnet networks (default: true)
 *
 * @param props - The component props
 * @param props.children - The children of the Providers component
 * @returns The Providers component or an error display if misconfigured
 *
 * @example
 * ```typescript
 * // Minimal configuration
 * window.x402 = {
 *   paymentRequirements: { network: "base", scheme: "exact", ... },
 *   cdpClientKey: "your-cdp-api-key",
 *   currentUrl: window.location.href,
 * };
 * ```
 */
export function Providers({ children }: ProvidersProps) {
  // Perform early validation with clear error messages
  // Note: requireApiKey is false because cdpClientKey is optional for basic paywall functionality
  // but OnchainKit features may be limited without it
  const validationResult = validateProviderConfig(window.x402, { requireApiKey: false });

  if (!validationResult.isValid) {
    // In development, show a helpful error UI
    if (process.env.NODE_ENV !== "production") {
      return <ConfigurationError errors={validationResult.errors} />;
    }
    // In production, throw to be caught by error boundaries
    assertValidProviderConfig(window.x402);
  }

  // Log warnings for non-critical issues
  if (validationResult.warnings.length > 0) {
    validationResult.warnings.forEach(warning => {
      console.warn(`[x402] ${warning}`);
    });
  }

  const { testnet = true, cdpClientKey, appName, appLogo, paymentRequirements } = window.x402;
  const selectedRequirement = choosePaymentRequirement(paymentRequirements, testnet);

  if (!isEvmNetwork(selectedRequirement.network)) {
    return <>{children}</>;
  }

  const chain = selectedRequirement.network === "base-sepolia" ? baseSepolia : base;

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
