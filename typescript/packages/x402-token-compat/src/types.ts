import { z } from "zod";

/**
 * Supported blockchain networks
 */
export type ChainName =
  | "ethereum"
  | "bsc"
  | "polygon"
  | "base"
  | "arbitrum"
  | "optimism"
  | "avalanche"
  | "b3"
  | "abstract";

/**
 * Chain ID to chain name mapping
 */
export const CHAIN_IDS: Record<number, ChainName> = {
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  43114: "avalanche",
  1113: "b3",
  2741: "abstract",
};

/**
 * Chain name to chain ID mapping
 */
export const CHAIN_NAMES: Record<ChainName, number> = {
  ethereum: 1,
  bsc: 56,
  polygon: 137,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
  b3: 1113,
  abstract: 2741,
};

/**
 * Token metadata response schema
 */
export const TokenMetadataSchema = z.object({
  chainId: z.number(),
  tokenAddress: z.string(),
  name: z.string().nullable(),
  symbol: z.string().nullable(),
  decimals: z.number().nullable(),
  logoUrl: z.string().nullable(),
  supportsEip2612: z.boolean(),
  supportsEip3009: z.boolean(),
});

/**
 * Token metadata type
 */
export type TokenMetadata = z.infer<typeof TokenMetadataSchema>;

/**
 * Pagination info
 */
export const PaginationSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
  returned: z.number(),
  hasMore: z.boolean(),
});

/**
 * Pagination type
 */
export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Token list filters
 */
export const TokenListFiltersSchema = z.object({
  eip2612: z.boolean().optional(),
  eip3009: z.boolean().optional(),
});

/**
 * Token list filters type
 */
export type TokenListFilters = z.infer<typeof TokenListFiltersSchema>;

/**
 * Token list response schema
 */
export const TokenListResponseSchema = z.object({
  chain: z.string(),
  chainId: z.number(),
  filters: TokenListFiltersSchema,
  pagination: PaginationSchema,
  tokens: z.array(TokenMetadataSchema),
});

/**
 * Token list response type
 */
export type TokenListResponse = z.infer<typeof TokenListResponseSchema>;

/**
 * Chain info
 */
export const ChainInfoSchema = z.object({
  name: z.string(),
  chainId: z.number(),
  fullName: z.string(),
  rpcConfigured: z.boolean(),
});

/**
 * Chain info type
 */
export type ChainInfo = z.infer<typeof ChainInfoSchema>;

/**
 * Token compatibility checker options
 */
export interface TokenCompatOptions {
  /**
   * Base URL for the token metadata API
   * @default "https://tokens.anyspend.com"
   */
  apiBaseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Custom fetch implementation (useful for Node.js environments)
   */
  fetch?: typeof fetch;
}

/**
 * Token list query options
 */
export interface TokenListOptions {
  /**
   * Number of tokens to return
   * @default 100
   */
  limit?: number;

  /**
   * Number of tokens to skip
   * @default 0
   */
  offset?: number;

  /**
   * Filter for EIP-2612 compatible tokens
   */
  eip2612?: boolean;

  /**
   * Filter for EIP-3009 compatible tokens
   */
  eip3009?: boolean;
}

/**
 * Error response from the API
 */
export class TokenCompatError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "TokenCompatError";
  }
}
