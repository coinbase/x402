import type { TonRpcLike } from "./types";

/** Configuration for the multi-provider TON RPC client. */
export type TonRpcConfig = {
  providers: Array<{
    name: string;
    endpoint: string;
    apiKey?: string;
  }>;
  /** Number of retry attempts per call (default: 3). */
  retryAttempts?: number;
  /** Delay in ms between retries (default: 1000). */
  retryDelay?: number;
};

/** Native transaction shape expected by TonRpcLike. */
type NativeTx = {
  hash: string;
  to: string;
  amount: string; // atomic units (nanoton)
  comment: string; // REQUIRED string (never null/undefined)
};

/** Jetton transfer event shape (superset of TonRpcLike expectation). */
type JettonEvent = {
  txHash: string;
  master: string; // jetton master address
  amount: string; // atomic units
  memo: string; // REQUIRED string (forward_payload decoded or empty when absent)
  to?: string; // optional recipient if provider supplies it
};

/**
 * Simple multi-provider TON RPC client that conforms to TonRpcLike.
 * Public methods are listed before private helpers to satisfy member-ordering.
 */
export class TonRpcClient implements TonRpcLike {
  private readonly config: {
    providers: TonRpcConfig["providers"];
    retryAttempts: number;
    retryDelay: number;
  };

  /**
   * Creates the RPC client.
   *
   * @param config - List of providers and retry settings.
   */
  constructor(config: TonRpcConfig) {
    this.config = {
      providers: config.providers,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Finds an incoming native TON transfer to `to` that matches `memo`.
   * Provider APIs differ; this method normalizes a minimal shape.
   *
   * @param to - Recipient address.
   * @param memo - Expected on-chain comment (memo).
   * @returns Matching transaction or null.
   */
  async findIncomingByMemo(to: string, memo: string): Promise<NativeTx | null> {
    return this.withRetry(async () => {
      for (const p of this.config.providers) {
        try {
          // Placeholder routes & shapes — adapt to your real provider(s)
          const res = await this.postJSON<{
            transactions?: Array<{
              hash: string;
              in_msg?: { destination?: string; value?: string; comment?: string | null };
            }>;
          }>(`${p.endpoint}/getTransactions`, { account: to, limit: 20 }, p.apiKey);

          const list = res.transactions ?? [];
          const found = list.find(t => {
            const dest = t.in_msg?.destination ?? "";
            const value = t.in_msg?.value ?? "0";
            const comment = t.in_msg?.comment ?? null;
            return dest === to && comment === memo && value !== "0";
          });

          if (!found) continue;

          return {
            hash: found.hash,
            to,
            amount: String(found.in_msg?.value ?? "0"),
            comment: String(found.in_msg?.comment ?? ""), // force string
          };
        } catch {
          // try next provider
          continue;
        }
      }
      return null;
    });
  }

  /**
   * Loads a native transaction by its hash.
   *
   * @param hash - Transaction hash.
   * @returns Normalized transaction or null.
   */
  async getTxByHash(hash: string): Promise<NativeTx | null> {
    return this.withRetry(async () => {
      for (const p of this.config.providers) {
        try {
          const res = await this.postJSON<{
            transaction?: {
              hash: string;
              in_msg?: { destination?: string; value?: string; comment?: string | null };
            };
          }>(`${p.endpoint}/getTransaction`, { hash }, p.apiKey);

          const t = res.transaction;
          if (!t) continue;

          return {
            hash: t.hash,
            to: String(t.in_msg?.destination ?? ""),
            amount: String(t.in_msg?.value ?? "0"),
            comment: String(t.in_msg?.comment ?? ""), // force string
          };
        } catch {
          continue;
        }
      }
      return null;
    });
  }

  /**
   * Query jetton transfers to a given address with filters.
   *
   * @param to - Destination address to query transfers for.
   * @param filter - Filter options for jetton transfers.
   * @param filter.master - Jetton master contract address to match.
   * @param filter.memo - Memo string to match in the transfer payload.
   * @returns A matching jetton transfer object or null if not found.
   */
  async getJettonTransferTo(
    to: string,
    filter: { master: string; memo: string },
  ): Promise<JettonEvent | null> {
    return this.withRetry(async () => {
      for (const p of this.config.providers) {
        try {
          // Placeholder routes & shapes — adapt to your real provider(s)
          const res = await this.postJSON<{
            events?: Array<{
              tx_hash: string;
              to?: string;
              jetton_master?: string;
              amount?: string;
              forward_payload_memo?: string | null;
            }>;
          }>(
            `${p.endpoint}/getJettonTransfers`,
            { account: to, jetton_master: filter.master, limit: 20 },
            p.apiKey,
          );

          const list = res.events ?? [];
          const match = list.find(
            e =>
              (e.to ?? to) === to &&
              (e.jetton_master ?? "") === filter.master &&
              String(e.forward_payload_memo ?? "") === filter.memo,
          );

          if (!match) continue;

          return {
            txHash: match.tx_hash,
            master: match.jetton_master ?? filter.master,
            amount: match.amount ?? "0",
            memo: String(match.forward_payload_memo ?? ""), // force string
            to: match.to ?? to,
          };
        } catch {
          continue;
        }
      }
      return null;
    });
  }

  /**
   * Returns the number of confirmations considered final.
   *
   * @returns Finality depth in blocks.
   */
  async getFinalityDepth(): Promise<number> {
    return 2;
  }

  // -------------------- private helpers --------------------

  /**
   * Retries the provided async operation with a fixed backoff.
   *
   * @param operation - Async function to execute.
   * @returns The operation result or throws the last error.
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastErr = err;
        if (attempt < this.config.retryAttempts - 1) {
          await this.sleep(this.config.retryDelay);
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("RPC_RETRY_FAILED");
  }

  /**
   * Performs a POST JSON request against a provider endpoint.
   *
   * @param url - Full provider URL.
   * @param body - Payload object.
   * @param apiKey - Optional provider API key.
   * @returns Parsed JSON typed as T.
   */
  private async postJSON<T>(
    url: string,
    body: Record<string, unknown>,
    apiKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`RPC request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Delays execution for the specified amount of time.
   *
   * @param ms - Milliseconds to sleep.
   */
  private async sleep(ms: number): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
  }
}

/**
 * Create a TonRpcClient configured to use toncenter.com as the provider.
 *
 * @param apiKey - Optional API key for toncenter.com.
 * @returns A TonRpcClient instance.
 */
export function createTonApiRpc(apiKey?: string): TonRpcClient {
  return new TonRpcClient({
    providers: [{ name: "tonapi", endpoint: "https://tonapi.io/v1", apiKey }],
  });
}

/**
 * Create a TonRpcClient configured to use toncenter.com as the provider.
 *
 * @param apiKey - Optional API key for toncenter.com.
 * @returns A TonRpcClient instance.
 */
export function createTonCenterRpc(apiKey?: string): TonRpcClient {
  return new TonRpcClient({
    providers: [{ name: "toncenter", endpoint: "https://toncenter.com/api/v2", apiKey }],
  });
}

/**
 * Create a TonRpcClient that uses multiple providers (tonapi, toncenter, and custom endpoints).
 *
 * @param config - Multi-provider configuration.
 * @param config.tonApiKey - Optional API key for tonapi.io.
 * @param config.toncenterKey - Optional API key for toncenter.com.
 * @param config.customEndpoints - Additional custom endpoints (name, endpoint, and optional API key).
 * @returns A TonRpcClient instance.
 */
export function createMultiProviderRpc(config: {
  tonApiKey?: string;
  toncenterKey?: string;
  customEndpoints?: Array<{ name: string; endpoint: string; apiKey?: string }>;
}): TonRpcClient {
  const providers: TonRpcConfig["providers"] = [];

  if (config.tonApiKey) {
    providers.push({ name: "tonapi", endpoint: "https://tonapi.io/v1", apiKey: config.tonApiKey });
  }
  if (config.toncenterKey) {
    providers.push({
      name: "toncenter",
      endpoint: "https://toncenter.com/api/v2",
      apiKey: config.toncenterKey,
    });
  }
  if (config.customEndpoints?.length) {
    providers.push(...config.customEndpoints);
  }

  return new TonRpcClient({ providers });
}
