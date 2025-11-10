export { X402Provider } from "./providers/X402Provider";
export { useX402Payment } from "./hooks/useX402Payment";
export { useX402Balance } from "./hooks/useX402Balance";
export * from "./types";

// Re-export commonly used wagmi hooks/rainbow kit's connect button for context, so they use wagmi hooks from this package
export {
  useAccount,
  useConnect,
  useDisconnect,
  useBalance,
  useSwitchChain,
  useChainId,
  useConfig,
} from "wagmi";
export type { Config } from "wagmi";

export { ConnectButton } from "@rainbow-me/rainbowkit";
