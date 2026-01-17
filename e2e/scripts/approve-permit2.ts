#!/usr/bin/env npx tsx
/**
 * Approve Permit2 to spend USDC on Base Sepolia
 *
 * Run: npx tsx e2e/scripts/approve-permit2.ts
 *
 * Required env vars:
 *   CLIENT_EVM_PRIVATE_KEY - Private key of the client wallet
 */

import { config } from 'dotenv';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  maxUint256,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

config();

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

const erc20ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

async function main() {
  const privateKey = process.env.CLIENT_EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ CLIENT_EVM_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  console.log('🔐 Wallet address:', account.address);
  console.log('📋 USDC address:', USDC_ADDRESS);
  console.log('📋 Permit2 address:', PERMIT2_ADDRESS);
  console.log('');

  // Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20ABI,
    functionName: 'allowance',
    args: [account.address, PERMIT2_ADDRESS],
  });

  console.log('📊 Current Permit2 allowance:', currentAllowance.toString());

  if (currentAllowance > 0n) {
    console.log('✅ Permit2 is already approved!');
    return;
  }

  console.log('');
  console.log('📝 Approving Permit2 to spend USDC...');

  const txHash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20ABI,
    functionName: 'approve',
    args: [PERMIT2_ADDRESS, maxUint256],
  });

  console.log('⏳ Transaction sent:', txHash);
  console.log('   Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.status === 'success') {
    console.log('✅ Permit2 approved successfully!');
    console.log('   Block:', receipt.blockNumber);
  } else {
    console.error('❌ Transaction failed!');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
