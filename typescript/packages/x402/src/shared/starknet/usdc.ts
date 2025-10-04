import { Contract, CallData, uint256, type Call } from "starknet";
import { StarknetSigner } from "./wallet";
import { StarknetConnectedClient, createContractInstance, callContract } from "./client";

/**
 * USDC contract addresses on different Starknet networks
 */
export const STARKNET_USDC_CONTRACTS = {
  starknet: "0x053C91253BC9682c04929cA02ED00b3E423f6710D2ee7e0D5EBB06F3eCF368A8", // USDC on mainnet
  "starknet-sepolia": "0x053b40A647CEDfca6cA84f542A0fe36736031905A9639a7f19A3C1e66bFd5080", // USDC on sepolia testnet
} as const;

/**
 * Standard ERC-20 ABI for USDC operations
 * Simplified function focusing on essential functions
 */
const USDC_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "name", type: "felt252" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "symbol", type: "felt252" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "decimals", type: "u8" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "totalSupply", type: "u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "felt252" }],
    outputs: [{ name: "balance", type: "u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "felt252" },
      { name: "spender", type: "felt252" },
    ],
    outputs: [{ name: "allowance", type: "u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "recipient", type: "felt252" },
      { name: "amount", type: "u256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "sender", type: "felt252" },
      { name: "recipient", type: "felt252" },
      { name: "amount", type: "u256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
    state_mutability: "external",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "felt252" },
      { name: "amount", type: "u256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
    state_mutability: "external",
  },
];

/**
 * Gets the USDC contract address for a given network
 *
 * @param network - The Starknet network
 * @returns The USDC contract address
 * @throws Error if the network is not supported
 */
export function getUsdcContractAddress(network: string): string {
  const address = STARKNET_USDC_CONTRACTS[network as keyof typeof STARKNET_USDC_CONTRACTS];
  if (!address) {
    throw new Error(`USDC contract address not found for network: ${network}`);
  }
  return address;
}

/**
 * Creates a USDC contract instance
 *
 * @param client - The Starknet connected client
 * @returns A USDC contract instance
 */
export function createUsdcContract(client: StarknetConnectedClient): Contract {
  const contractAddress = getUsdcContractAddress(client.network);
  return createContractInstance(client, contractAddress, USDC_ABI);
}

/**
 * Gets the USDC balance for an address
 *
 * @param client - The Starknet connected client
 * @param address - The address to check balance for
 * @returns The USDC balance as a string (in wei, 6 decimals for USDC)
 */
export async function getUsdcBalance(
  client: StarknetConnectedClient,
  address: string,
): Promise<string> {
  const contractAddress = getUsdcContractAddress(client.network);

  try {
    const result = await callContract(client, contractAddress, "balanceOf", [address]);

    // Convert the result to a proper uint256 value
    const balance = uint256.uint256ToBN({
      low: result[0],
      high: result[1],
    });

    return balance.toString();
  } catch (error) {
    throw new Error(`Failed to get USDC balance: ${error}`);
  }
}

/**
 * Gets the USDC allowance between owner and spender
 *
 * @param client - The Starknet connected client
 * @param owner - The owner address
 * @param spender - The spender address
 * @returns The allowance amount as a string
 */
export async function getUsdcAllowance(
  client: StarknetConnectedClient,
  owner: string,
  spender: string,
): Promise<string> {
  const contractAddress = getUsdcContractAddress(client.network);

  try {
    const result = await callContract(client, contractAddress, "allowance", [owner, spender]);

    const allowance = uint256.uint256ToBN({
      low: result[0],
      high: result[1],
    });

    return allowance.toString();
  } catch (error) {
    throw new Error(`Failed to get USDC allowance: ${error}`);
  }
}

/**
 * Transfers USDC tokens
 *
 * @param signer - The Starknet signer
 * @param recipient - The recipient address
 * @param amount - The amount to transfer (in wei, 6 decimals for USDC)
 * @returns The transaction response
 */
export async function transferUsdc(signer: StarknetSigner, recipient: string, amount: string) {
  const contractAddress = getUsdcContractAddress(signer.network);
  const amountUint256 = uint256.bnToUint256(amount);

  const call: Call = {
    contractAddress,
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient,
      amount: amountUint256,
    }),
  };

  return await signer.account.execute(call);
}

/**
 * Transfers USDC tokens from one address to another (requires allowance)
 *
 * @param signer - The Starknet signer
 * @param sender - The sender address
 * @param recipient - The recipient address
 * @param amount - The amount to transfer (in wei, 6 decimals for USDC)
 * @returns The transaction response
 */
export async function transferUsdcFrom(
  signer: StarknetSigner,
  sender: string,
  recipient: string,
  amount: string,
) {
  const contractAddress = getUsdcContractAddress(signer.network);
  const amountUint256 = uint256.bnToUint256(amount);

  const call: Call = {
    contractAddress,
    entrypoint: "transferFrom",
    calldata: CallData.compile({
      sender,
      recipient,
      amount: amountUint256,
    }),
  };

  return await signer.account.execute(call);
}

/**
 * Approves a spender to use USDC tokens
 *
 * @param signer - The Starknet signer
 * @param spender - The spender address
 * @param amount - The amount to approve (in wei, 6 decimals for USDC)
 * @returns The transaction response
 */
export async function approveUsdc(signer: StarknetSigner, spender: string, amount: string) {
  const contractAddress = getUsdcContractAddress(signer.network);
  const amountUint256 = uint256.bnToUint256(amount);

  const call: Call = {
    contractAddress,
    entrypoint: "approve",
    calldata: CallData.compile({
      spender,
      amount: amountUint256,
    }),
  };

  return await signer.account.execute(call);
}

/**
 * Gets USDC token information (name, symbol, decimals)
 *
 * @param client - The Starknet connected client
 * @returns Token information object
 */
export async function getUsdcTokenInfo(client: StarknetConnectedClient): Promise<{
  name: string;
  symbol: string;
  decimals: number;
}> {
  const contractAddress = getUsdcContractAddress(client.network);

  try {
    const [nameResult, symbolResult, decimalsResult] = await Promise.all([
      callContract(client, contractAddress, "name"),
      callContract(client, contractAddress, "symbol"),
      callContract(client, contractAddress, "decimals"),
    ]);

    return {
      name: nameResult[0], // Convert felt252 to string in production
      symbol: symbolResult[0], // Convert felt252 to string in production
      decimals: parseInt(decimalsResult[0], 10),
    };
  } catch (error) {
    throw new Error(`Failed to get USDC token info: ${error}`);
  }
}

/**
 * Converts USDC amount from human readable to wei (6 decimals)
 *
 * @param amount - The amount in human readable format (e.g., "1.5" for 1.5 USDC)
 * @returns The amount in wei as a string
 */
export function parseUsdcAmount(amount: string): string {
  const decimals = 6; // USDC has 6 decimals
  const [integer, decimal = ""] = amount.split(".");
  const paddedDecimal = decimal.padEnd(decimals, "0").slice(0, decimals);
  return (BigInt(integer) * BigInt(10 ** decimals) + BigInt(paddedDecimal)).toString();
}

/**
 * Converts USDC amount from wei to human readable format
 *
 * @param amount - The amount in wei as a string
 * @returns The amount in human readable format
 */
export function formatUsdcAmount(amount: string): string {
  const decimals = 6; // USDC has 6 decimals
  const divisor = BigInt(10 ** decimals);
  const bigIntAmount = BigInt(amount);

  const integer = bigIntAmount / divisor;
  const remainder = bigIntAmount % divisor;

  if (remainder === BigInt(0)) {
    return integer.toString();
  }

  const decimalStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${integer}.${decimalStr}`;
}
