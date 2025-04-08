import { Account, Address, Chain, Client, Transport } from "viem";
import { usdcABI as abi } from "./erc20PermitABI.js";
import { config } from "./config.js";
import { ConnectedClient } from "./wallet.js";

export function getUsdcAddress<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  account extends Account | undefined = undefined,
>(client: Client<transport, chain, account>): Address {
  return config[client.chain!.id.toString()].usdcAddress as Address;
}

export function getUsdcAddressForChain(chainId: number): Address {
  return config[chainId.toString()].usdcAddress as Address;
}

// Cache for storing the version value
let versionCache: string | null = null;

// Function to get the USDC contract version
export async function getVersion<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined = undefined,
>(client: ConnectedClient<transport, chain, account>): Promise<string> {
  // Return cached version if available
  if (versionCache !== null) {
    return versionCache;
  }

  // Fetch and cache version if not available
  const version = await client.readContract({
    address: getUsdcAddress(client),
    abi,
    functionName: "version",
  });
  versionCache = version as string;
  return versionCache;
}

export async function getUSDCBalance<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined = undefined,
>(client: ConnectedClient<transport, chain, account>, address: Address): Promise<bigint> {
  const balance = await client.readContract({
    address: getUsdcAddressForChain(client.chain!.id),
    abi,
    functionName: "balanceOf",
    args: [address],
  });
  return balance as bigint;
}
