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
  "1328": {
    usdcAddress: "0xeAcd10aaA6f362a94823df6BBC3C536841870772",
    usdcName: "USDC",
  },
  "1329": {
    // This USDC is an IBC Bridged one and does not support EIP3009
    // TODO: Substitute with a native USDC when available
    usdcAddress: "0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1",
    usdcName: "USDC",
  },
};

export type ChainConfig = {
  usdcAddress: Address;
  usdcName: string;
};
