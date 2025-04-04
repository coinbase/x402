import { base, baseSepolia } from "viem/chains";
import { createConfig, injected } from "@wagmi/core";
import { http } from "viem";
import { coinbaseWallet } from "@wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [coinbaseWallet({ appName: "x402" }), injected()],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});

export const chainConfig = {
  "84532": {
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
  },
  "8453": {
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcName: "USDC",
  },
};
