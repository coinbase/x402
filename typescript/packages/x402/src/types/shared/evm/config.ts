import { Address } from "viem";
import { Address as SolanaAddress } from "@solana/kit";

export const config: Record<string, ChainConfig> = {
  "84532": {
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
  },
  "8453": {
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcName: "USD Coin",
  },
  "43113": {
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    usdcName: "USD Coin",
  },
  "43114": {
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    usdcName: "USD Coin",
  },
  "4689": {
    usdcAddress: "0xcdf79194c6c285077a58da47641d4dbe51f63542",
    usdcName: "Bridged USDC",
  },
  // solana devnet
  "103": {
    usdcAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as SolanaAddress,
    usdcName: "USDC",
  },
  // solana mainnet
  "101": {
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as SolanaAddress,
    usdcName: "USDC",
  },
  "1328": {
    usdcAddress: "0x4fcf1784b31630811181f670aea7a7bef803eaed",
    usdcName: "USDC",
  },
  "1329": {
    usdcAddress: "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392",
    usdcName: "USDC",
  },
  // SKALE Nebula
  "1482601649": {
    usdcAddress: "0xCC205196288B7A26f6D43bBD68AaA98dde97276d",
    usdcName: "Europa USDC",
  },
  // SKALE Nebula Testnet
  "37084624": {
    usdcAddress: "0x6ab391237A6A207BBFa3648743260B02622303D2",
    usdcName: "USDC",
  },
  // SKALE Europa
  "2046399126": {
    usdcAddress: "0x5F795bb52dAC3085f578f4877D450e2929D2F13d",
    usdcName: "USD Coin",
  },
  // SKALE Europa Testnet
  "1444673419": {
    usdcAddress: "0x9eAb55199f4481eCD7659540A17Af618766b07C4",
    usdcName: "USDC",
  },
  // SKALE Calypso
  "1564830818": {
    usdcAddress: "0x7Cf76E740Cb23b99337b21F392F22c47Ad910c67",
    usdcName: "Europa USDC",
  },
  // SKALE Calypso Testnet
  "974399131": {
    usdcAddress: "0xbA9E8905F3c3C576f048eEbB3431ede0d5D27682",
    usdcName: "USDC",
  },
};

export type ChainConfig = {
  usdcAddress: Address | SolanaAddress;
  usdcName: string;
};
