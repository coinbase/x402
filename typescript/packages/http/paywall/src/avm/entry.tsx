import React from "react";
import { createRoot } from "react-dom/client";
import { WalletManager, WalletId, NetworkId } from "@txnlab/use-wallet";
import { AlgodClient } from "@algorandfoundation/algokit-utils/algod-client";
import { AvmPaywall } from "./AvmPaywall";
import type {} from "../window";
import { ALGORAND_NETWORK_REFS } from "../paywallUtils";

// AVM-specific paywall entry point
window.addEventListener("load", async () => {
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
  const isTestnet = network.includes(ALGORAND_NETWORK_REFS.TESTNET);

  // Configure Algod client based on network
  const algodConfig = isTestnet
    ? {
        token: "",
        baseServer: "https://testnet-api.algonode.cloud",
        port: "",
      }
    : {
        token: "",
        baseServer: "https://mainnet-api.algonode.cloud",
        port: "",
      };

  // Create Algod client
  const algodClient = new AlgodClient({
    baseUrl: algodConfig.baseServer,
    token: algodConfig.token || undefined,
  });

  // Initialize WalletManager with Algorand wallets
  const walletManager = new WalletManager({
    wallets: [WalletId.PERA, WalletId.DEFLY, WalletId.LUTE],
    network: isTestnet ? NetworkId.TESTNET : NetworkId.MAINNET,
    algod: {
      token: algodConfig.token,
      baseServer: algodConfig.baseServer,
      port: algodConfig.port,
    },
  });

  const root = createRoot(rootElement);
  root.render(
    <AvmPaywall
      paymentRequired={paymentRequired}
      walletManager={walletManager}
      algodClient={algodClient}
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
    />,
  );
});
