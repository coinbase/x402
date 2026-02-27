import React from "react";
import ReactDOM from "react-dom/client";
import { CDPReactProvider } from "@coinbase/cdp-react";
import { Theme } from "@radix-ui/themes";

import { App } from "./App";
import { APP_CONFIG, CDP_CONFIG } from "./cdpConfig";
import { ChainProvider } from "./ChainProvider";
import { ElectronWindow } from "./window";

import { getDiscoveryList } from "./services/discovery";
import { getWalletAddress, signMessage } from "./services/walletService";

import { makeX402Request } from "./utils/x402Client";

import "@radix-ui/themes/styles.css";
import "./main.module.css";

const chain = import.meta.env.VITE_TESTNET ? "base-sepolia" : "base";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CDPReactProvider config={CDP_CONFIG} app={APP_CONFIG}>
      <ChainProvider chain={chain}>
        <Theme accentColor="blue" grayColor="mauve" panelBackground="translucent">
          <App />
        </Theme>
      </ChainProvider>
    </CDPReactProvider>
  </React.StrictMode>,
);

/*
Set up callbacks for the main node process to communicate to the browser window for signing
*/
declare let window: ElectronWindow;

window.electron.OnSignMessage(signMessage);
window.electron.OnDiscoveryList(getDiscoveryList);
window.electron.OnMakeX402Request(makeX402Request);
window.electron.OnGetWalletAddress(getWalletAddress);
