import { encodeFunctionData } from "viem";

/**
 * Standard ERC20 transfer function ABI
 */
export const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

/**
 * Builds ERC20 transfer call data.
 *
 * @param token - The ERC20 token contract address
 * @param to - The recipient address
 * @param amount - The amount to transfer (in token's smallest unit)
 * @returns The encoded call data for the transfer function
 */
export function buildERC20TransferCallData(
  token: `0x${string}`,
  to: `0x${string}`,
  amount: bigint,
): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [to, amount],
  });
}
