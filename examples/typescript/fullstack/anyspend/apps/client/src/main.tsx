import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { config } from "./wagmi.config";
import { SolanaWalletProvider } from "./SolanaWalletProvider";
import { WagmiProviderWrapper } from "./WagmiProviderWrapper";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProviderWrapper config={config}>
      <QueryClientProvider client={queryClient}>
        <SolanaWalletProvider>
          <App />
        </SolanaWalletProvider>
      </QueryClientProvider>
    </WagmiProviderWrapper>
  </React.StrictMode>,
);
