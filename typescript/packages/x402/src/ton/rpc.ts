import type { TonRpcLike } from "./types";
import { normalizeTonAddress } from "./utils";

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
          if (p.name === "tonapi") {
            const base = p.endpoint.replace(/\/$/, "");
            const url = `${base}/v2/blockchain/accounts/${encodeURIComponent(
              to,
            )}/transactions?limit=100`;

            const data = await this.getJSON<{
              transactions?: Array<{
                hash: string;
                in_msg?: {
                  value?: string;
                  destination?: { address?: string } | string;
                  decoded_body?: { text?: string };
                };
              }>;
            }>(url, p.apiKey);

            const toNorm = normalizeTonAddress(to);
            const tx = (data.transactions ?? []).find(t => {
              const inMsg = t.in_msg;
              if (!inMsg || !inMsg.value || inMsg.value === "0") return false;

              const dest =
                typeof inMsg.destination === "string"
                  ? inMsg.destination
                  : (inMsg.destination?.address ?? "");
              const destNorm = normalizeTonAddress(dest);

              const comment = inMsg.decoded_body?.text ?? "";
              return comment === memo && destNorm === toNorm;
            });

            if (tx) {
              return {
                hash: tx.hash,
                to,
                amount: String(tx.in_msg?.value ?? "0"),
                comment: String(tx.in_msg?.decoded_body?.text ?? ""),
              };
            }
          }

          if (p.name === "toncenter") {
            const base = p.endpoint.replace(/\/$/, "");
            const url = `${base}/getTransactions?address=${encodeURIComponent(
              to,
            )}&limit=100&archival=true${p.apiKey ? `&api_key=${encodeURIComponent(p.apiKey)}` : ""}`;

            const data = await this.getJSON<{
              ok: boolean;
              result?: Array<{
                transaction_id?: { hash?: string };
                in_msg?: { destination?: string; value?: string; message?: string };
              }>;
            }>(url);

            const toNorm = normalizeTonAddress(to);
            const tx = (data.result ?? []).find(t => {
              const inMsg = t.in_msg;
              if (!inMsg || !inMsg.value || inMsg.value === "0") return false;

              const dest = inMsg.destination ?? "";
              const destNorm = normalizeTonAddress(dest);
              const comment = inMsg.message ?? "";
              return comment === memo && destNorm === toNorm;
            });

            if (tx) {
              return {
                hash: String(tx.transaction_id?.hash ?? ""),
                to,
                amount: String(tx.in_msg?.value ?? "0"),
                comment: String(tx.in_msg?.message ?? ""),
              };
            }
          }
        } catch {
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
          if (p.name === "tonapi") {
            const base = p.endpoint.replace(/\/$/, "");
            const url = `${base}/v2/blockchain/transactions/${encodeURIComponent(hash)}`;

            const t = await this.getJSON<{
              hash: string;
              in_msg?: {
                value?: string;
                destination?: { address?: string } | string;
                decoded_body?: { text?: string };
              };
            }>(url, p.apiKey);

            const inMsg = t.in_msg;
            const toAddr =
              typeof inMsg?.destination === "string"
                ? inMsg.destination
                : (inMsg?.destination?.address ?? "");
            return {
              hash: t.hash,
              to: String(toAddr),
              amount: String(inMsg?.value ?? "0"),
              comment: String(inMsg?.decoded_body?.text ?? ""),
            };
          }

          if (p.name === "toncenter") {
            const base = p.endpoint.replace(/\/$/, "");
            const url = `${base}/getTransaction?hash=${encodeURIComponent(
              hash,
            )}${p.apiKey ? `&api_key=${encodeURIComponent(p.apiKey)}` : ""}`;

            const t = await this.getJSON<{
              ok: boolean;
              result?: {
                transaction_id?: { hash?: string };
                in_msg?: { destination?: string; value?: string; message?: string };
              };
            }>(url);

            const toAddr = t.result?.in_msg?.destination ?? "";
            return {
              hash: String(t.result?.transaction_id?.hash ?? hash),
              to: String(toAddr),
              amount: String(t.result?.in_msg?.value ?? "0"),
              comment: String(t.result?.in_msg?.message ?? ""),
            };
          }
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
          if (p.name === "tonapi") {
            const base = p.endpoint.replace(/\/$/, "");
            const url = `${base}/v2/blockchain/accounts/${encodeURIComponent(to)}/events?limit=100`;

            interface JettonTransferEvent {
              events?: Array<{
                event_id?: string;
                tx_hash?: string;
                hash?: string;
                actions?: Array<Record<string, unknown>>;
              }>;
            }
            const ev = await this.getJSON<JettonTransferEvent>(url, p.apiKey);

            const toNorm = normalizeTonAddress(to);
            const masterNorm = normalizeTonAddress(filter.master);

            for (const e of ev.events ?? []) {
              for (const a of e.actions ?? []) {
                const action = a as Record<string, unknown>;
                const jt = action.JettonTransfer ?? action.jetton_transfer ?? null;
                if (!jt) continue;
                const jtData = jt as Record<string, unknown>;
                const jettonInfo = jtData.jetton as Record<string, unknown> | undefined;
                const masterInfo = jettonInfo?.master as Record<string, unknown> | undefined;
                const masterAddr = masterInfo?.address ?? jtData.jetton_master ?? "";
                const masterAddrNorm = normalizeTonAddress(String(masterAddr));

                const recipientInfo = jtData.recipient as Record<string, unknown> | undefined;
                const recipientAddr = recipientInfo?.address ?? jtData.recipient ?? "";
                const recipientNorm = normalizeTonAddress(String(recipientAddr));

                const payloadInfo = jtData.payload as Record<string, unknown> | undefined;
                const comment = String(jtData.comment ?? payloadInfo?.comment ?? "");

                if (masterAddrNorm !== masterNorm) continue;
                if (recipientNorm !== toNorm) continue;
                if (comment !== filter.memo) continue;

                return {
                  txHash: e.tx_hash ?? e.hash ?? e.event_id ?? "",
                  master: filter.master,
                  amount: String(jtData.amount ?? "0"),
                  memo: comment,
                };
              }
            }
          }
          // toncenter does not expose easy jetton transfers endpoint -> TODO
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
   * Performs a GET JSON request against a provider endpoint.
   *
   * @param url - Full provider URL.
   * @param apiKey - Optional provider API key.
   * @returns Parsed JSON typed as T.
   */
  private async getJSON<T>(url: string, apiKey?: string): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) throw new Error(`RPC GET failed: ${res.status} ${res.statusText}`);
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
    providers: [{ name: "tonapi", endpoint: "https://tonapi.io", apiKey }],
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
    providers.push({ name: "tonapi", endpoint: "https://tonapi.io", apiKey: config.tonApiKey });
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
