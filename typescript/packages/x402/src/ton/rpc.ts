import type { TonRpcLike } from './types';

export type TonRpcConfig = {
  providers: Array<{
    name: string;
    endpoint: string;
    apiKey?: string;
  }>;
  retryAttempts?: number;
  retryDelay?: number;
};

export class TonRpcClient implements TonRpcLike {
  private config: TonRpcConfig;

  constructor(config: TonRpcConfig) {
    this.config = {
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
  }

  private async makeRequest(endpoint: string, params: any, apiKey?: string): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.retryAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
    }

    throw lastError;
  }

  async findIncomingByMemo(to: string, memo: string) {
    return this.withRetry(async () => {
      for (const provider of this.config.providers) {
        try {
          // Example implementation for tonapi.io
          // Adapt based on actual provider APIs
          const result = await this.makeRequest(
            `${provider.endpoint}/getTransactions`,
            {
              account: to,
              limit: 10,
              // Add filters for memo and incoming
            },
            provider.apiKey
          );

          // Parse and return matching transaction
          // This is a placeholder - implement actual parsing
          return null; // or parsed tx object
        } catch (error) {
          console.warn(`Provider ${provider.name} failed:`, error);
          continue;
        }
      }
      return null;
    });
  }

  async getTxByHash(hash: string) {
    return this.withRetry(async () => {
      for (const provider of this.config.providers) {
        try {
          const result = await this.makeRequest(
            `${provider.endpoint}/getTransaction`,
            { hash },
            provider.apiKey
          );

          // Parse and return transaction
          return null; // or parsed tx object
        } catch (error) {
          console.warn(`Provider ${provider.name} failed:`, error);
          continue;
        }
      }
      return null;
    });
  }

  async getJettonTransferTo(to: string, filter: { master: string; memo: string }) {
    return this.withRetry(async () => {
      for (const provider of this.config.providers) {
        try {
          // Query jetton transfers
          const result = await this.makeRequest(
            `${provider.endpoint}/getJettonTransfers`,
            {
              account: to,
              jetton_master: filter.master,
              comment: filter.memo,
              limit: 10,
            },
            provider.apiKey
          );

          // Parse and return matching transfer
          return null; // or parsed transfer object
        } catch (error) {
          console.warn(`Provider ${provider.name} failed:`, error);
          continue;
        }
      }
      return null;
    });
  }

  async getFinalityDepth(): Promise<number> {
    // Return current finality depth (typically 2-3 blocks for TON)
    return 2;
  }
}

// Factory functions for common configurations
export function createTonApiRpc(apiKey?: string): TonRpcClient {
  return new TonRpcClient({
    providers: [{
      name: 'tonapi',
      endpoint: 'https://tonapi.io/v1',
      apiKey
    }]
  });
}

export function createTonCenterRpc(apiKey?: string): TonRpcClient {
  return new TonRpcClient({
    providers: [{
      name: 'toncenter',
      endpoint: 'https://toncenter.com/api/v2',
      apiKey
    }]
  });
}

export function createMultiProviderRpc(config: {
  tonApiKey?: string;
  toncenterKey?: string;
  customEndpoints?: Array<{ name: string; endpoint: string; apiKey?: string }>;
}): TonRpcClient {
  const providers = [];

  if (config.tonApiKey) {
    providers.push({
      name: 'tonapi',
      endpoint: 'https://tonapi.io/v1',
      apiKey: config.tonApiKey
    });
  }

  if (config.toncenterKey) {
    providers.push({
      name: 'toncenter',
      endpoint: 'https://toncenter.com/api/v2',
      apiKey: config.toncenterKey
    });
  }

  if (config.customEndpoints) {
    providers.push(...config.customEndpoints);
  }

  return new TonRpcClient({ providers });
}
