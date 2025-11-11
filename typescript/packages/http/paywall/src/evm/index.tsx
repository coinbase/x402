import React from "react";
import { createRoot } from "react-dom/client";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base, baseSepolia } from "viem/chains";
import { EvmPaywall } from "./EvmPaywall";
import { EVM_CHAIN_IDS } from "../paywallUtils";
import type {} from "../window";

// EVM-specific paywall entry point
window.addEventListener("load", () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element not found");
    return;
  }

  const x402 = window.x402;
  const paymentRequired = x402.paymentRequired;

  if (!paymentRequired?.accepts?.[0]) {
    console.error("No payment requirements found");
    return;
  }

  const network = paymentRequired.accepts[0].network;
  const chainId = network.split(":")[1];
  const chain = chainId === EVM_CHAIN_IDS.BASE_SEPOLIA ? baseSepolia : base;

  const root = createRoot(rootElement);
  root.render(
    <OnchainKitProvider
      apiKey={x402.cdpClientKey || undefined}
      chain={chain}
      config={{
        appearance: {
          mode: "light",
          theme: "base",
          name: x402.appName || undefined,
          logo: x402.appLogo || undefined,
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
      <EvmPaywall
        paymentRequired={paymentRequired}
        onSuccessfulResponse={async (response: Response) => {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("text/html")) {
            document.documentElement.innerHTML = await response.text();
          } else {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            window.location.href = url;
          }
        }}
      />
    </OnchainKitProvider>,
  );
});
