import { encodeFunctionData, getAddress, maxUint256 } from "viem";
import type { Erc20ApprovalGasSponsoringInfo } from "@x402/extensions";
import { PERMIT2_ADDRESS } from "../../constants";
import { ClientEvmSigner } from "../../signer";

/** ERC-20 approve ABI for encoding approve(address,uint256) calldata */
const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

/**
 * Signs an EIP-1559 `approve(Permit2, MaxUint256)` transaction for the given token.
 *
 * The signed transaction is NOT broadcast here — the facilitator broadcasts it
 * atomically before settling the Permit2 payment. This enables Permit2 payments
 * for generic ERC-20 tokens that do NOT implement EIP-2612.
 *
 * Always approves MaxUint256 regardless of the payment amount.
 *
 * @param signer - The client EVM signer (must support signTransaction, getTransactionCount)
 * @param tokenAddress - The ERC-20 token contract address
 * @param chainId - The chain ID
 * @returns The ERC-20 approval gas sponsoring info object
 */
export async function signErc20ApprovalTransaction(
  signer: ClientEvmSigner,
  tokenAddress: `0x${string}`,
  chainId: number,
): Promise<Erc20ApprovalGasSponsoringInfo> {
  const from = signer.address;
  const spender = getAddress(PERMIT2_ADDRESS);

  // Encode approve(PERMIT2_ADDRESS, MaxUint256) calldata
  const data = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [spender, maxUint256],
  });

  // Get current nonce for the sender
  const nonce = await signer.getTransactionCount!({ address: from });

  // Get current fee estimates, with fallback values
  let maxFeePerGas: bigint;
  let maxPriorityFeePerGas: bigint;
  try {
    const fees = await signer.estimateFeesPerGas!();
    maxFeePerGas = fees.maxFeePerGas;
    maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
  } catch {
    // Fallback to 1 gwei base and priority fees
    maxFeePerGas = 1_000_000_000n;
    maxPriorityFeePerGas = 100_000_000n;
  }

  // Sign the EIP-1559 transaction (not broadcast)
  const signedTransaction = await signer.signTransaction!({
    to: tokenAddress,
    data,
    nonce,
    gas: 70_000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId,
  });

  return {
    from,
    asset: tokenAddress,
    spender,
    amount: maxUint256.toString(),
    signedTransaction,
    version: "1",
  };
}
