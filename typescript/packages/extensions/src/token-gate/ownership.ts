/**
 * On-chain token ownership check with TTL cache
 *
 * EVM: uses viem readContract to call balanceOf() or ownerOf() on ERC-20/ERC-721 contracts.
 * SVM: uses the Solana JSON RPC getTokenAccountsByOwner to sum SPL token balances.
 * Results are cached per address+chain/network+contract to avoid RPC spam.
 */

import { createPublicClient, http } from "viem";
import type { TokenContract, EvmTokenContract, SvmTokenContract } from "./types";

/** balanceOf(address) → uint256 — same ABI for ERC-20 and ERC-721 */
const BALANCE_OF_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** ownerOf(tokenId) → address — ERC-721 specific token check */
const OWNER_OF_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

interface CacheEntry {
  isHolder: boolean;
  expiresAt: number;
}

/** In-memory ownership cache, keyed by `address:chainId:contractAddress` or `svm:address:network:mint` */
const ownershipCache = new Map<string, CacheEntry>();

/** Per-chain public clients, keyed by chainId */
const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

/**
 * Returns a cached viem public client for the given EVM chain.
 *
 * @param chain - viem chain object
 * @returns Public client for the chain
 */
function getPublicClient(chain: EvmTokenContract["chain"]) {
  const existing = clientCache.get(chain.id);
  if (existing) return existing;
  const client = createPublicClient({ chain, transport: http() });
  clientCache.set(chain.id, client);
  return client;
}

/**
 * Maps a Solana network identifier to its JSON RPC URL.
 *
 * @param network - CAIP-2 network string or raw https URL
 * @returns RPC endpoint URL
 */
function solanaNetworkToRpcUrl(network: string): string {
  if (network === "solana:mainnet-beta" || network === "mainnet-beta") {
    return "https://api.mainnet-beta.solana.com";
  }
  if (network === "solana:devnet" || network === "devnet") {
    return "https://api.devnet.solana.com";
  }
  if (network === "solana:testnet" || network === "testnet") {
    return "https://api.testnet.solana.com";
  }
  // Allow raw https URLs for custom RPC endpoints
  if (network.startsWith("http")) {
    return network;
  }
  return "https://api.mainnet-beta.solana.com";
}

/**
 * Check whether a single EVM contract grants holder status to the address.
 *
 * @param address - EVM wallet address to check
 * @param contract - EVM token contract definition
 * @param cacheTtlMs - Cache TTL in milliseconds
 * @returns True if the address holds the required tokens
 */
async function checkEvmContract(
  address: `0x${string}`,
  contract: EvmTokenContract,
  cacheTtlMs: number,
): Promise<boolean> {
  const cacheKey = `${address.toLowerCase()}:${contract.chain.id}:${contract.address.toLowerCase()}${contract.tokenId !== undefined ? `:${contract.tokenId}` : ""}`;

  const cached = ownershipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isHolder;
  }

  const client = getPublicClient(contract.chain);
  let isHolder: boolean;

  if (contract.type === "ERC-721" && contract.tokenId !== undefined) {
    // Specific token ID check via ownerOf
    try {
      const owner = (await client.readContract({
        address: contract.address,
        abi: OWNER_OF_ABI,
        functionName: "ownerOf",
        args: [contract.tokenId],
      })) as `0x${string}`;
      isHolder = owner.toLowerCase() === address.toLowerCase();
    } catch {
      // ownerOf reverts for non-existent tokens
      isHolder = false;
    }
  } else {
    // Generic balanceOf check for ERC-20 and ERC-721
    const minBalance = contract.minBalance ?? 1n;
    const balance = (await client.readContract({
      address: contract.address,
      abi: BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [address],
    })) as bigint;
    isHolder = balance >= minBalance;
  }

  ownershipCache.set(cacheKey, { isHolder, expiresAt: Date.now() + cacheTtlMs });
  return isHolder;
}

/**
 * Check whether a Solana SPL token contract grants holder status to the address.
 *
 * @param address - Solana wallet address (base58)
 * @param contract - SVM token contract definition
 * @param cacheTtlMs - Cache TTL in milliseconds
 * @returns True if the address holds the required tokens
 */
async function checkSvmContract(
  address: string,
  contract: SvmTokenContract,
  cacheTtlMs: number,
): Promise<boolean> {
  const cacheKey = `svm:${address}:${contract.network}:${contract.mint}`;

  const cached = ownershipCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isHolder;
  }

  const rpcUrl = solanaNetworkToRpcUrl(contract.network);

  let isHolder = false;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [address, { mint: contract.mint }, { encoding: "jsonParsed" }],
      }),
    });

    const data = (await response.json()) as {
      result?: {
        value?: Array<{
          account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } };
        }>;
      };
    };

    const accounts = data.result?.value ?? [];
    let totalBalance = 0n;
    for (const account of accounts) {
      const amount = account.account?.data?.parsed?.info?.tokenAmount?.amount;
      if (amount) {
        totalBalance += BigInt(amount);
      }
    }

    const minBalance = contract.minBalance ?? 1n;
    isHolder = totalBalance >= minBalance;
  } catch {
    // RPC error or invalid address — not a holder
    isHolder = false;
  }

  ownershipCache.set(cacheKey, { isHolder, expiresAt: Date.now() + cacheTtlMs });
  return isHolder;
}

/**
 * Check on-chain token ownership for the given address.
 *
 * Routes EVM contracts through viem and SVM contracts through the Solana JSON RPC.
 * Address format mismatch (e.g. EVM address against SVM contract) returns false.
 *
 * @param address - Wallet address to check (hex for EVM, base58 for Solana)
 * @param contracts - Token contracts to verify against
 * @param matchMode - "any" (default): holder if any contract passes; "all": all must pass
 * @param cacheTtlSeconds - How long to cache results (default: 300)
 * @returns true if the address qualifies as a token holder
 */
export async function checkOwnership(
  address: string,
  contracts: TokenContract[],
  matchMode: "any" | "all" = "any",
  cacheTtlSeconds = 300,
): Promise<boolean> {
  if (contracts.length === 0) return false;

  const cacheTtlMs = cacheTtlSeconds * 1000;
  const isEvmAddress = address.startsWith("0x");

  /**
   * Routes a single contract to the appropriate EVM or SVM checker.
   *
   * @param contract - Token contract to check
   * @returns True if the address qualifies as a holder for this contract
   */
  async function checkContract(contract: TokenContract): Promise<boolean> {
    if (contract.vm === "evm") {
      // Skip EVM contracts for non-EVM addresses
      if (!isEvmAddress) return false;
      return checkEvmContract(address as `0x${string}`, contract, cacheTtlMs);
    } else {
      // Skip SVM contracts for EVM addresses
      if (isEvmAddress) return false;
      return checkSvmContract(address, contract, cacheTtlMs);
    }
  }

  if (matchMode === "all") {
    for (const contract of contracts) {
      const isHolder = await checkContract(contract);
      if (!isHolder) return false;
    }
    return true;
  } else {
    for (const contract of contracts) {
      const isHolder = await checkContract(contract);
      if (isHolder) return true;
    }
    return false;
  }
}

/**
 * Clear the ownership cache. Useful for testing.
 */
export function clearOwnershipCache(): void {
  ownershipCache.clear();
}
