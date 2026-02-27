/**
 * Permit2 Approval Script
 *
 * This script manages Permit2 allowance for the client wallet.
 * It can grant unlimited approval or revoke existing approval.
 *
 * Usage:
 *   pnpm tsx scripts/permit2-approval.ts approve  # Check and approve if needed
 *   pnpm tsx scripts/permit2-approval.ts revoke   # Revoke Permit2 approval (set allowance to 0)
 *
 * Environment variables required:
 *   CLIENT_EVM_PRIVATE_KEY - Private key of the client wallet
 */

import { config } from 'dotenv';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

config();

// Permit2 canonical address (same on all EVM chains)
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Base Sepolia USDC
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const USDC_DECIMALS = 6;

// Maximum uint256 for unlimited approval
const MAX_UINT256 = 2n ** 256n - 1n;

// ERC20 ABI for approve and allowance
const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

async function main() {
  const action = process.argv[2];

  if (!action || (action !== 'approve' && action !== 'revoke')) {
    console.log(`
Permit2 Approval Script

Usage:
  pnpm tsx scripts/permit2-approval.ts approve  # Check and approve Permit2 if needed
  pnpm tsx scripts/permit2-approval.ts revoke   # Revoke Permit2 approval (set allowance to 0)

Environment variables required:
  CLIENT_EVM_PRIVATE_KEY - Private key of the client wallet
`);
    process.exit(1);
  }

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

  console.log(`\n🔑 Wallet: ${account.address}`);
  console.log(`📍 Network: Base Sepolia`);
  console.log(`💰 Token: USDC (${USDC_ADDRESS})`);
  console.log(`🔐 Permit2: ${PERMIT2_ADDRESS}\n`);

  // Check current balance
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });
  console.log(`💵 USDC Balance: ${formatUnits(balance, USDC_DECIMALS)} USDC`);

  // Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, PERMIT2_ADDRESS],
  });

  const formattedAllowance =
    currentAllowance === MAX_UINT256
      ? 'unlimited'
      : `${formatUnits(currentAllowance, USDC_DECIMALS)} USDC`;
  console.log(`📋 Current Permit2 Allowance: ${formattedAllowance}\n`);

  if (action === 'revoke') {
    // Revoke approval by setting allowance to 0
    if (currentAllowance === 0n) {
      console.log('✅ Permit2 approval is already revoked (allowance is 0)');
      process.exit(0);
    }

    console.log('🔄 Revoking Permit2 approval (setting allowance to 0)...');

    const hash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PERMIT2_ADDRESS, 0n],
    });

    console.log(`📝 Transaction submitted: ${hash}`);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`\n✅ Permit2 approval revoked successfully!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed}`);
    } else {
      console.error(`\n❌ Revoke transaction failed`);
      process.exit(1);
    }
    return;
  }

  // action === 'approve'
  // Check if approval already exists
  if (currentAllowance === MAX_UINT256) {
    console.log('✅ Permit2 already has unlimited approval');
    process.exit(0);
  }

  // Grant unlimited approval
  console.log('🔄 Granting unlimited Permit2 approval...');

  const hash = await walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'approve',
    args: [PERMIT2_ADDRESS, MAX_UINT256],
  });

  console.log(`📝 Transaction submitted: ${hash}`);
  console.log('⏳ Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === 'success') {
    console.log(`\n✅ Permit2 approval granted successfully!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);
  } else {
    console.error(`\n❌ Transaction failed`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
