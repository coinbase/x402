import { Address } from "viem";

export const config: Record<string, ChainConfig> = {
  "84532": {
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
  },
};

export type ChainConfig = {
  usdcAddress: Address;
  usdcName: string;
};
