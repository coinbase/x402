import { z } from "zod";

import {
  CHAIN_IDS,
  CHAIN_NAMES,
  ChainInfo,
  ChainInfoSchema,
  ChainName,
  TokenCompatError,
  TokenCompatOptions,
  TokenListOptions,
  TokenListResponse,
  TokenListResponseSchema,
  TokenMetadata,
  TokenMetadataSchema,
} from "./types";

/**
 * Token compatibility checker client
 * Provides methods to check EIP-2612 and EIP-3009 support for tokens
 */
export class TokenCompatClient {
  private readonly apiBaseUrl: string;
  private readonly timeout: number;
  private readonly fetchFn: typeof fetch;

  /**
   * Create a new TokenCompatClient instance
   * @param options - Configuration options
   */
  constructor(options: TokenCompatOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://tokens.anyspend.com";
    this.timeout = options.timeout ?? 10000;
    this.fetchFn = options.fetch ?? fetch;
  }

  /**
   * Make an HTTP request to the API
   * @param path - API path
   * @returns Response data
   */
  private async request<T>(path: string): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new TokenCompatError(
          `API request failed: ${response.statusText}`,
          response.status,
          body
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TokenCompatError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new TokenCompatError(`Request timeout after ${this.timeout}ms`);
        }
        throw new TokenCompatError(`Request failed: ${error.message}`);
      }

      throw new TokenCompatError("Unknown error occurred");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get list of supported chains
   * @returns Array of supported chains with their configuration
   */
  async getSupportedChains(): Promise<ChainInfo[]> {
    const data = await this.request<unknown[]>("/chains");
    return z.array(ChainInfoSchema).parse(data);
  }

  /**
   * Get token metadata including EIP support information
   * @param chain - Chain name or chain ID
   * @param tokenAddress - Token contract address
   * @returns Token metadata
   */
  async getTokenMetadata(
    chain: ChainName | number,
    tokenAddress: string
  ): Promise<TokenMetadata> {
    const chainName =
      typeof chain === "number" ? CHAIN_IDS[chain] : (chain as ChainName);

    if (!chainName) {
      throw new TokenCompatError(`Unsupported chain ID: ${chain}`);
    }

    const normalizedAddress = tokenAddress.toLowerCase();
    const data = await this.request<unknown>(
      `/metadata/${chainName}/${normalizedAddress}`
    );

    return TokenMetadataSchema.parse(data);
  }

  /**
   * Check if a token supports EIP-2612 (Permit)
   * @param chain - Chain name or chain ID
   * @param tokenAddress - Token contract address
   * @returns True if the token supports EIP-2612
   */
  async supportsEip2612(
    chain: ChainName | number,
    tokenAddress: string
  ): Promise<boolean> {
    const metadata = await this.getTokenMetadata(chain, tokenAddress);
    return metadata.supportsEip2612;
  }

  /**
   * Check if a token supports EIP-3009 (TransferWithAuthorization)
   * @param chain - Chain name or chain ID
   * @param tokenAddress - Token contract address
   * @returns True if the token supports EIP-3009
   */
  async supportsEip3009(
    chain: ChainName | number,
    tokenAddress: string
  ): Promise<boolean> {
    const metadata = await this.getTokenMetadata(chain, tokenAddress);
    return metadata.supportsEip3009;
  }

  /**
   * Check if a token supports both EIP-2612 and EIP-3009
   * @param chain - Chain name or chain ID
   * @param tokenAddress - Token contract address
   * @returns Object with support status for both EIPs
   */
  async getEipSupport(
    chain: ChainName | number,
    tokenAddress: string
  ): Promise<{
    supportsEip2612: boolean;
    supportsEip3009: boolean;
  }> {
    const metadata = await this.getTokenMetadata(chain, tokenAddress);
    return {
      supportsEip2612: metadata.supportsEip2612,
      supportsEip3009: metadata.supportsEip3009,
    };
  }

  /**
   * List tokens on a specific chain with optional filtering
   * @param chain - Chain name or chain ID
   * @param options - Query options for filtering and pagination
   * @returns Token list response with pagination info
   */
  async listTokens(
    chain: ChainName | number,
    options: TokenListOptions = {}
  ): Promise<TokenListResponse> {
    const chainName =
      typeof chain === "number" ? CHAIN_IDS[chain] : (chain as ChainName);

    if (!chainName) {
      throw new TokenCompatError(`Unsupported chain ID: ${chain}`);
    }

    const params = new URLSearchParams();

    if (options.limit !== undefined) {
      params.append("limit", options.limit.toString());
    }
    if (options.offset !== undefined) {
      params.append("offset", options.offset.toString());
    }
    if (options.eip2612 !== undefined) {
      params.append("eip2612", options.eip2612.toString());
    }
    if (options.eip3009 !== undefined) {
      params.append("eip3009", options.eip3009.toString());
    }

    const queryString = params.toString();
    const path = `/tokens/${chainName}${queryString ? `?${queryString}` : ""}`;

    const data = await this.request<unknown>(path);
    return TokenListResponseSchema.parse(data);
  }

  /**
   * Get all tokens that support EIP-2612 on a specific chain
   * @param chain - Chain name or chain ID
   * @param options - Pagination options
   * @returns Token list response
   */
  async listEip2612Tokens(
    chain: ChainName | number,
    options: Omit<TokenListOptions, "eip2612" | "eip3009"> = {}
  ): Promise<TokenListResponse> {
    return this.listTokens(chain, {
      ...options,
      eip2612: true,
    });
  }

  /**
   * Get all tokens that support EIP-3009 on a specific chain
   * @param chain - Chain name or chain ID
   * @param options - Pagination options
   * @returns Token list response
   */
  async listEip3009Tokens(
    chain: ChainName | number,
    options: Omit<TokenListOptions, "eip2612" | "eip3009"> = {}
  ): Promise<TokenListResponse> {
    return this.listTokens(chain, {
      ...options,
      eip3009: true,
    });
  }

  /**
   * Get all tokens that support both EIP-2612 and EIP-3009 on a specific chain
   * @param chain - Chain name or chain ID
   * @param options - Pagination options
   * @returns Token list response
   */
  async listFullyCompatibleTokens(
    chain: ChainName | number,
    options: Omit<TokenListOptions, "eip2612" | "eip3009"> = {}
  ): Promise<TokenListResponse> {
    return this.listTokens(chain, {
      ...options,
      eip2612: true,
      eip3009: true,
    });
  }

  /**
   * Helper to get chain name from chain ID
   * @param chainId - Chain ID
   * @returns Chain name or undefined if not found
   */
  static getChainName(chainId: number): ChainName | undefined {
    return CHAIN_IDS[chainId];
  }

  /**
   * Helper to get chain ID from chain name
   * @param chainName - Chain name
   * @returns Chain ID
   */
  static getChainId(chainName: ChainName): number {
    return CHAIN_NAMES[chainName];
  }
}
