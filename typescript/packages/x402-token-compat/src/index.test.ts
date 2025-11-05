import { describe, expect, it, vi } from "vitest";

import { TokenCompatClient } from "./client";
import {
  ChainInfo,
  TokenCompatError,
  TokenListResponse,
  TokenMetadata,
} from "./types";

describe("TokenCompatClient", () => {
  // Mock responses
  const mockTokenMetadata: TokenMetadata = {
    chainId: 8453,
    tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    logoUrl:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png",
    supportsEip2612: true,
    supportsEip3009: true,
  };

  const mockTokenList: TokenListResponse = {
    chain: "base",
    chainId: 8453,
    filters: {
      eip2612: true,
    },
    pagination: {
      limit: 100,
      offset: 0,
      total: 42,
      returned: 42,
      hasMore: false,
    },
    tokens: [mockTokenMetadata],
  };

  const mockChains: ChainInfo[] = [
    {
      name: "base",
      chainId: 8453,
      fullName: "Base",
      rpcConfigured: true,
    },
    {
      name: "ethereum",
      chainId: 1,
      fullName: "Ethereum",
      rpcConfigured: false,
    },
  ];

  describe("Constructor", () => {
    it("should create instance with default options", () => {
      const client = new TokenCompatClient();
      expect(client).toBeInstanceOf(TokenCompatClient);
    });

    it("should create instance with custom options", () => {
      const client = new TokenCompatClient({
        apiBaseUrl: "https://custom-api.example.com",
        timeout: 5000,
      });
      expect(client).toBeInstanceOf(TokenCompatClient);
    });
  });

  describe("getTokenMetadata", () => {
    it("should fetch token metadata by chain name", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenMetadata,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.getTokenMetadata(
        "base",
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      );

      expect(result).toEqual(mockTokenMetadata);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/metadata/base/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        expect.any(Object)
      );
    });

    it("should fetch token metadata by chain ID", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenMetadata,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.getTokenMetadata(
        8453,
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      );

      expect(result).toEqual(mockTokenMetadata);
    });

    it("should normalize token address to lowercase", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenMetadata,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      await client.getTokenMetadata(
        "base",
        "0x833589FCD6EDB6E08F4C7C32D4F71B54BDA02913"
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
        expect.any(Object)
      );
    });

    it("should throw error for unsupported chain ID", async () => {
      const client = new TokenCompatClient();

      await expect(client.getTokenMetadata(99999, "0x123")).rejects.toThrow(
        TokenCompatError
      );
    });

    it("should throw error on API failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Invalid token address",
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });

      await expect(client.getTokenMetadata("base", "invalid")).rejects.toThrow(
        TokenCompatError
      );
    });

    it("should handle timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(
        (_url: string, options?: any) =>
          new Promise((resolve, reject) => {
            const timeoutId = setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => mockTokenMetadata,
                }),
              2000
            );

            // Listen for abort signal
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                clearTimeout(timeoutId);
                const error = new Error("The operation was aborted");
                error.name = "AbortError";
                reject(error);
              });
            }
          })
      );

      const client = new TokenCompatClient({
        fetch: mockFetch as any,
        timeout: 100,
      });

      await expect(client.getTokenMetadata("base", "0x123")).rejects.toThrow(
        /timeout/i
      );
    });
  });

  describe("supportsEip2612", () => {
    it("should return true for EIP-2612 compatible token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenMetadata,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.supportsEip2612(
        "base",
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      );

      expect(result).toBe(true);
    });

    it("should return false for non-EIP-2612 token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...mockTokenMetadata,
          supportsEip2612: false,
        }),
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.supportsEip2612("base", "0x123");

      expect(result).toBe(false);
    });
  });

  describe("supportsEip3009", () => {
    it("should return true for EIP-3009 compatible token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenMetadata,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.supportsEip3009(
        "base",
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      );

      expect(result).toBe(true);
    });

    it("should return false for non-EIP-3009 token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...mockTokenMetadata,
          supportsEip3009: false,
        }),
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.supportsEip3009("base", "0x123");

      expect(result).toBe(false);
    });
  });

  describe("getEipSupport", () => {
    it("should return both EIP support statuses", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenMetadata,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.getEipSupport(
        "base",
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      );

      expect(result).toEqual({
        supportsEip2612: true,
        supportsEip3009: true,
      });
    });
  });

  describe("listTokens", () => {
    it("should list tokens without filters", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.listTokens("base");

      expect(result).toEqual(mockTokenList);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/tokens/base",
        expect.any(Object)
      );
    });

    it("should list tokens with EIP-2612 filter", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      await client.listTokens("base", { eip2612: true });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/tokens/base?eip2612=true",
        expect.any(Object)
      );
    });

    it("should list tokens with pagination", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      await client.listTokens("base", { limit: 50, offset: 100 });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/tokens/base?limit=50&offset=100",
        expect.any(Object)
      );
    });

    it("should list tokens with multiple filters", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      await client.listTokens("base", {
        eip2612: true,
        eip3009: true,
        limit: 50,
      });

      const call = mockFetch.mock.calls[0][0];
      expect(call).toContain("eip2612=true");
      expect(call).toContain("eip3009=true");
      expect(call).toContain("limit=50");
    });
  });

  describe("listEip2612Tokens", () => {
    it("should list EIP-2612 compatible tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.listEip2612Tokens("base");

      expect(result).toEqual(mockTokenList);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/tokens/base?eip2612=true",
        expect.any(Object)
      );
    });
  });

  describe("listEip3009Tokens", () => {
    it("should list EIP-3009 compatible tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      await client.listEip3009Tokens("base");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/tokens/base?eip3009=true",
        expect.any(Object)
      );
    });
  });

  describe("listFullyCompatibleTokens", () => {
    it("should list tokens with both EIP-2612 and EIP-3009 support", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenList,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      await client.listFullyCompatibleTokens("base");

      const call = mockFetch.mock.calls[0][0];
      expect(call).toContain("eip2612=true");
      expect(call).toContain("eip3009=true");
    });
  });

  describe("getSupportedChains", () => {
    it("should fetch list of supported chains", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockChains,
      });

      const client = new TokenCompatClient({ fetch: mockFetch as any });
      const result = await client.getSupportedChains();

      expect(result).toEqual(mockChains);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://tokens.anyspend.com/chains",
        expect.any(Object)
      );
    });
  });

  describe("Static helpers", () => {
    it("should get chain name from ID", () => {
      expect(TokenCompatClient.getChainName(8453)).toBe("base");
      expect(TokenCompatClient.getChainName(1)).toBe("ethereum");
      expect(TokenCompatClient.getChainName(99999)).toBeUndefined();
    });

    it("should get chain ID from name", () => {
      expect(TokenCompatClient.getChainId("base")).toBe(8453);
      expect(TokenCompatClient.getChainId("ethereum")).toBe(1);
    });
  });
});
