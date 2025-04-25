import { Address } from "viem";

export const config: Record<string, ChainConfig> = {
  "84532": {
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
  },
  "8453": {
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcName: "USDC",
  },
};

export type ChainConfig = {
  usdcAddress: Address;
  usdcName: string;
};
