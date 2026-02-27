import type { Address, Client, Chain, Transport, Account } from "viem";

/**
 * USDC contract addresses by chain ID
 */
const USDC_ADDRESSES: Record<number, Address> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum Mainnet
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base Mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

/**
 * ERC20 balanceOf ABI
 */
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

/**
 * Gets the USDC balance for a specific address on the current chain.
 *
 * @param client - Viem client instance connected to the blockchain
 * @param address - Address to check the USDC balance for
 * @returns USDC balance as bigint (0 if USDC not supported on chain or error)
 */
export async function getUSDCBalance<
  TTransport extends Transport,
  TChain extends Chain,
  TAccount extends Account | undefined = undefined,
>(client: Client<TTransport, TChain, TAccount>, address: Address): Promise<bigint> {
  const chainId = client.chain?.id;
  if (!chainId) return 0n;

  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) return 0n;

  try {
    const balance = await client.readContract({
      address: usdcAddress,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return balance as bigint;
  } catch (error) {
    console.error("Failed to fetch USDC balance:", error);
    return 0n;
  }
}
