import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import type { ReactNode } from "react";

const apiKey = "DH5sdIHJLvw9pH5u05gIG68jMjdZLGDq";

/**
 *
 * @param props
 * @param props.children
 */
export function Providers(props: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={base as any}
      config={{
        appearance: {
          mode: "auto",
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
      {props.children}
    </OnchainKitProvider>
  );
}
