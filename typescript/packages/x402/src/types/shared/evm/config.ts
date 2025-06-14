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
  "43113": {
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    usdcName: "USD Coin",
  },
  "43114": {
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    usdcName: "USDC",
  },
  "4689": {
    usdcAddress: "0xcdf79194c6c285077a58da47641d4dbe51f63542",
    usdcName: "Bridged USDC",
  },
  "42161": {
    usdcAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    usdcName: "USDC",
  },
  "421614": {
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    usdcName: "USDC",
  },
};
export type ChainConfig = {
  usdcAddress: Address;
  usdcName: string;
};
