/**
 * Permit2 Approval Script
 *
 * This script manages Permit2 allowance for the client wallet.
 * It can grant unlimited approval or revoke existing approval.
 *
 * Usage:
 *   pnpm tsx scripts/permit2-approval.ts approve [tokenAddress]
 *   pnpm tsx scripts/permit2-approval.ts revoke  [tokenAddress]
 *
 * If tokenAddress is not provided, defaults to Base Sepolia USDC.
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
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

config();

// Permit2 canonical address (same on all EVM chains)
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const evmNetwork = process.env.EVM_NETWORK || 'eip155:84532';
const evmRpcUrl = process.env.EVM_RPC_URL;
const evmChain = evmNetwork === 'eip155:8453' ? base : baseSepolia;
const isMainnet = evmNetwork === 'eip155:8453';

const TOKENS_BY_NETWORK: Record<string, Record<string, { address: `0x${string}`; decimals: number; name: string }>> = {
  'eip155:84532': {
    USDC: {
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
      name: 'USDC',
    },
  },
  'eip155:8453': {
    USDC: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      name: 'USDC',
    },
  },
};

const TOKENS = TOKENS_BY_NETWORK[evmNetwork] || TOKENS_BY_NETWORK['eip155:84532'];

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
  pnpm tsx scripts/permit2-approval.ts approve [tokenAddress]
  pnpm tsx scripts/permit2-approval.ts revoke  [tokenAddress]

If tokenAddress is not provided, defaults to Base Sepolia USDC.

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
    chain: evmChain,
    transport: http(evmRpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: evmChain,
    transport: http(evmRpcUrl),
  });

  console.log(`\n🔑 Wallet: ${account.address}`);
  console.log(`📍 Network: ${evmChain.name} (${evmNetwork})`);
  console.log(`🔐 Permit2: ${PERMIT2_ADDRESS}\n`);

  // Display balance and allowance for all known tokens
  const tokenStates: { name: string; address: `0x${string}`; decimals: number; balance: bigint; allowance: bigint }[] = [];

  for (const token of Object.values(TOKENS)) {
    const balance = await publicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account.address],
    });

    const allowance = await publicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, PERMIT2_ADDRESS],
    });

    tokenStates.push({ ...token, balance, allowance });

    const formattedBalance = `${formatUnits(balance, token.decimals)} ${token.name}`;
    const formattedAllowance =
      allowance === MAX_UINT256
        ? 'unlimited'
        : `${formatUnits(allowance, token.decimals)} ${token.name}`;

    console.log(`💰 ${token.name} (${token.address})`);
    console.log(`   💵 Balance: ${formattedBalance}`);
    console.log(`   📋 Permit2 Allowance: ${formattedAllowance}`);
  }
  console.log();

  if (action === 'revoke') {
    for (const token of tokenStates) {
      if (token.allowance === 0n) {
        console.log(`✅ ${token.name}: Permit2 approval already revoked (allowance is 0)`);
        continue;
      }

      console.log(`🔄 ${token.name}: Revoking Permit2 approval...`);

      const hash = await walletClient.writeContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PERMIT2_ADDRESS, 0n],
      });

      console.log(`   📝 Transaction: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log(`   ✅ Revoked (block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);
      } else {
        console.error(`   ❌ Revoke transaction failed`);
        process.exit(1);
      }
    }
    return;
  }

  // action === 'approve'
  for (const token of tokenStates) {
    if (token.allowance === MAX_UINT256) {
      console.log(`✅ ${token.name}: Permit2 already has unlimited approval`);
      continue;
    }

    console.log(`🔄 ${token.name}: Granting unlimited Permit2 approval...`);

    const hash = await walletClient.writeContract({
      address: token.address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PERMIT2_ADDRESS, MAX_UINT256],
    });

    console.log(`   📝 Transaction: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log(`   ✅ Approved (block ${receipt.blockNumber}, gas ${receipt.gasUsed})`);
    } else {
      console.error(`   ❌ Transaction failed`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
