/**
 * On-chain token ownership check with TTL cache
 *
 * Uses viem readContract to call balanceOf() or ownerOf() on ERC-20/ERC-721 contracts.
 * Results are cached per address+chain+contract to avoid RPC spam.
 */

import { createPublicClient, http } from "viem";
import type { TokenContract } from "./types";

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

/** In-memory ownership cache, keyed by `address:chainId:contractAddress` */
const ownershipCache = new Map<string, CacheEntry>();

/** Per-chain public clients, keyed by chainId */
const clientCache = new Map<number, ReturnType<typeof createPublicClient>>();

function getPublicClient(chain: TokenContract["chain"]) {
  const existing = clientCache.get(chain.id);
  if (existing) return existing;
  const client = createPublicClient({ chain, transport: http() });
  clientCache.set(chain.id, client);
  return client;
}

/**
 * Check whether a single contract grants holder status to the address.
 */
async function checkSingleContract(
  address: `0x${string}`,
  contract: TokenContract,
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
 * Check on-chain token ownership for the given address.
 *
 * @param address - Wallet address to check
 * @param contracts - Token contracts to verify against
 * @param matchMode - "any" (default): holder if any contract passes; "all": all must pass
 * @param cacheTtlSeconds - How long to cache results (default: 300)
 * @returns true if the address qualifies as a token holder
 */
export async function checkOwnership(
  address: `0x${string}`,
  contracts: TokenContract[],
  matchMode: "any" | "all" = "any",
  cacheTtlSeconds = 300,
): Promise<boolean> {
  if (contracts.length === 0) return false;

  const cacheTtlMs = cacheTtlSeconds * 1000;

  if (matchMode === "all") {
    for (const contract of contracts) {
      const isHolder = await checkSingleContract(address, contract, cacheTtlMs);
      if (!isHolder) return false;
    }
    return true;
  } else {
    for (const contract of contracts) {
      const isHolder = await checkSingleContract(address, contract, cacheTtlMs);
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
