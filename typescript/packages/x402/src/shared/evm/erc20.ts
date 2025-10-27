import { Account, Address, Chain, Transport } from "viem";
import { usdcABI as erc20PermitABI } from "../../types/shared/evm/erc20PermitABI";
import { ConnectedClient } from "../../types/shared/evm/wallet";

/**
 * Gets the USDC balance for a specific address
 *
 * @param client - The Viem client instance connected to the blockchain
 * @param erc20Address - The address of the ERC20 contract
 * @param address - The address to check the USDC balance for
 * @returns A promise that resolves to the USDC balance as a bigint
 */
export async function getERC20Balance<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined = undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  erc20Address: Address,
  address: Address,
): Promise<bigint> {
  const balance = await client.readContract({
    address: erc20Address,
    abi: erc20PermitABI,
    functionName: "balanceOf",
    args: [address],
  });
  return balance as bigint;
}

/**
 * Gets the ERC20 allowance for a spender
 *
 * @param client - The Viem client instance connected to the blockchain
 * @param erc20Address - The address of the ERC20 contract
 * @param owner - The address of the token owner
 * @param spender - The address of the spender
 * @returns A promise that resolves to the allowance as a bigint
 */
export async function getERC20Allowance<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined = undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  erc20Address: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  const allowance = await client.readContract({
    address: erc20Address,
    abi: erc20PermitABI,
    functionName: "allowance",
    args: [owner, spender],
  });
  return allowance as bigint;
}
