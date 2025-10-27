import { createPublicClient, defineChain, http, type PublicClient } from "viem";

/**
 * Production-ready EVM client builders for BSC with RPC fallbacks.
 *
 * Environment variables (optional but recommended):
 * - BSC_RPC_PRIMARY, BSC_RPC_FALLBACK_1, BSC_RPC_FALLBACK_2
 * - BSC_TESTNET_RPC_PRIMARY, BSC_TESTNET_RPC_FALLBACK_1, BSC_TESTNET_RPC_FALLBACK_2
 */

const BSC = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  network: "bsc",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

const BSC_TESTNET = defineChain({
  id: 97,
  name: "BNB Smart Chain Testnet",
  network: "bsc-testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

/**
 * Reads a prioritized list of RPC URLs from environment variables.
 * Empty or missing values are filtered out.
 *
 * @param keys - Environment variable names in priority order.
 * @returns An array of non-empty RPC URLs in the same order as provided keys.
 */
function getRpcUrlsFromEnv(keys: string[]): string[] {
  return keys
    .map(k => (typeof process !== "undefined" ? process.env[k] : undefined))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
}

/**
 * Builds an ordered list of viem PublicClient instances for BSC mainnet using env-defined RPCs.
 * First client is the primary; subsequent are fallbacks. Falls back to a public endpoint in dev.
 *
 * @returns Array of PublicClient instances ordered by priority.
 */
export function makeBscClients(): PublicClient[] {
  const urls = getRpcUrlsFromEnv(["BSC_RPC_PRIMARY", "BSC_RPC_FALLBACK_1", "BSC_RPC_FALLBACK_2"]);
  // If none provided, use a sane public default (ok for dev, not for prod SLOs)
  const finalUrls = urls.length > 0 ? urls : ["https://rpc.ankr.com/bsc"];
  return finalUrls.map(u =>
    createPublicClient({
      chain: BSC,
      transport: http(u, { timeout: 8_000 }),
    }),
  );
}

/**
 * Builds an ordered list of viem PublicClient instances for BSC testnet using env-defined RPCs.
 * First client is the primary; subsequent are fallbacks. Falls back to a public endpoint in dev.
 *
 * @returns Array of PublicClient instances ordered by priority.
 */
export function makeBscTestnetClients(): PublicClient[] {
  const urls = getRpcUrlsFromEnv([
    "BSC_TESTNET_RPC_PRIMARY",
    "BSC_TESTNET_RPC_FALLBACK_1",
    "BSC_TESTNET_RPC_FALLBACK_2",
  ]);
  const finalUrls = urls.length > 0 ? urls : ["https://rpc.ankr.com/bsc_testnet"]; // dev default
  return finalUrls.map(u =>
    createPublicClient({
      chain: BSC_TESTNET,
      transport: http(u, { timeout: 8_000 }),
    }),
  );
}

/**
 * Executes an asynchronous operation over a list of viem clients with simple failover.
 * Tries each client in order until one succeeds; calls `opts.onError` for each failure.
 *
 * @param clients - List of viem PublicClient instances in priority order.
 * @param operation - Async function that will be executed against a client.
 * @param opts - Optional callbacks.
 * @param opts.onError - Called with (error, index) when an attempt fails.
 * @returns The result of the first successful operation.
 * @throws The last error when all clients fail.
 */
export async function withEvmClientsRetry<T>(
  clients: PublicClient[],
  operation: (c: PublicClient) => Promise<T>,
  opts?: { onError?: (err: unknown, index: number) => void },
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < clients.length; i++) {
    try {
      return await operation(clients[i]);
    } catch (err) {
      lastErr = err;
      opts?.onError?.(err, i);
      // continue to next client
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("EVM_RPC_ALL_FAILED");
}

/**
 * Convenience helper returning the first (primary) BSC mainnet client.
 * Useful when retries are handled at a higher layer.
 *
 * @returns The primary PublicClient instance for BSC.
 */
export function getPrimaryBscClient(): PublicClient {
  const list = makeBscClients();
  if (list.length === 0) throw new Error("NO_BSC_RPC_CONFIGURED");
  return list[0];
}

/**
 * Convenience helper returning the first (primary) BSC testnet client.
 * Useful when retries are handled at a higher layer.
 *
 * @returns The primary PublicClient instance for BSC testnet.
 */
export function getPrimaryBscTestnetClient(): PublicClient {
  const list = makeBscTestnetClients();
  if (list.length === 0) throw new Error("NO_BSC_TESTNET_RPC_CONFIGURED");
  return list[0];
}
