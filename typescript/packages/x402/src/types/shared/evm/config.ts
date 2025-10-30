import { Address } from "viem";
import { Address as SolanaAddress } from "@solana/kit";

export const config: Record<string, ChainConfig> = {
  // Ethereum (1)
  "1": {
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcName: "USD Coin",
  },
  // Optimism (10)
  "10": {
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdcName: "USD Coin",
  },
  // BSC (56)
  "56": {
    usdcAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    usdcName: "USD Coin",
  },
  // Solana Mainnet (101)
  "101": {
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as SolanaAddress,
    usdcName: "USDC",
  },
  // Solana Devnet (103)
  "103": {
    usdcAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as SolanaAddress,
    usdcName: "USDC",
  },
  // Polygon (137)
  "137": {
    usdcAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    usdcName: "USD Coin",
  },
  // Sei Testnet (1328)
  "1328": {
    usdcAddress: "0x4fcf1784b31630811181f670aea7a7bef803eaed",
    usdcName: "USDC",
  },
  // Sei (1329)
  "1329": {
    usdcAddress: "0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392",
    usdcName: "USDC",
  },
  // Abstract (2741)
  "2741": {
    usdcAddress: "0x84a71ccd554cc1b02749b35d22f684cc8ec987e1",
    usdcName: "Bridged USDC",
  },
  // Peaq (3338)
  "3338": {
    usdcAddress: "0xbbA60da06c2c5424f03f7434542280FCAd453d10",
    usdcName: "USDC",
  },
  // IoTeX (4689)
  "4689": {
    usdcAddress: "0xcdf79194c6c285077a58da47641d4dbe51f63542",
    usdcName: "Bridged USDC",
  },
  // Base (8453)
  "8453": {
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcName: "USD Coin",
  },
  // B3 (8333)
  "8333": {
    usdcAddress: "0x05D032ac25d322df992303dCa074EE7392C117b9",
    usdcName: "USD Coin",
  },
  // Abstract Testnet (11124)
  "11124": {
    usdcAddress: "0xe4C7fBB0a626ed208021ccabA6Be1566905E2dFc",
    usdcName: "Bridged USDC",
  },
  // Arbitrum (42161)
  "42161": {
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcName: "USD Coin",
  },
  // Avalanche Fuji (43113)
  "43113": {
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    usdcName: "USD Coin",
  },
  // Avalanche (43114)
  "43114": {
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    usdcName: "USD Coin",
  },
  // Polygon Amoy (80002)
  "80002": {
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    usdcName: "USDC",
  },
  // Base Sepolia (84532)
  "84532": {
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
  },
};

export type ChainConfig = {
  usdcAddress: Address | SolanaAddress;
  usdcName: string;
};
