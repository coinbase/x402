import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./solana-rpc-proxy";

// Mock fetch globally
global.fetch = vi.fn();

describe("solana-rpc-proxy POST handler", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock environment variables
    mockEnv = {
      SOLANA_MAINNET_RPC_URL: "https://mainnet.helius-rpc.com/?api-key=test-key",
    };
    vi.stubGlobal("process", {
      env: mockEnv,
    });

    // Set up Express request and response mocks
    mockReq = {
      body: {},
    } as Request;

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("successful RPC proxying", () => {
    it("should proxy RPC request successfully", async () => {
      const mockRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"],
      };

      const mockRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          value: {
            lamports: 1000000,
            owner: "11111111111111111111111111111111",
          },
        },
      };

      mockReq.body = mockRpcRequest;

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRpcResponse),
      } as unknown as globalThis.Response);

      await POST(mockReq as Request, mockRes as Response);

      expect(fetch).toHaveBeenCalledWith("https://mainnet.helius-rpc.com/?api-key=test-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mockRpcRequest),
      });

      expect(mockRes.json).toHaveBeenCalledWith(mockRpcResponse);
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should use default RPC URL when SOLANA_MAINNET_RPC_URL is not set", async () => {
      mockEnv.SOLANA_MAINNET_RPC_URL = undefined;

      const mockRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      };

      const mockRpcResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: 123456789,
      };

      mockReq.body = mockRpcRequest;

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockRpcResponse),
      } as unknown as globalThis.Response);

      await POST(mockReq as Request, mockRes as Response);

      expect(fetch).toHaveBeenCalledWith("https://api.mainnet-beta.solana.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mockRpcRequest),
      });

      expect(mockRes.json).toHaveBeenCalledWith(mockRpcResponse);
    });
  });

  describe("request body validation", () => {
    it("should return 400 when body is missing", async () => {
      mockReq.body = undefined;

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid request body: Expected JSON-RPC request object",
      });
    });

    it("should return 400 when body is not an object", async () => {
      mockReq.body = "invalid-body";

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid request body: Expected JSON-RPC request object",
      });
    });

    it("should return 400 when jsonrpc field is missing", async () => {
      mockReq.body = {
        id: 1,
        method: "getSlot",
      };

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid JSON-RPC request: Missing jsonrpc or method field",
      });
    });

    it("should return 400 when method field is missing", async () => {
      mockReq.body = {
        jsonrpc: "2.0",
        id: 1,
      };

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Invalid JSON-RPC request: Missing jsonrpc or method field",
      });
    });
  });

  describe("Solana RPC errors", () => {
    it("should return 403 when RPC returns 403 (rate limit)", async () => {
      mockReq.body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      } as unknown as globalThis.Response);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Solana RPC request failed",
        details: "Forbidden",
      });
    });

    it("should return 429 when RPC returns 429 (too many requests)", async () => {
      mockReq.body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      } as unknown as globalThis.Response);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Solana RPC request failed",
        details: "Too Many Requests",
      });
    });

    it("should return 500 when RPC returns 500", async () => {
      mockReq.body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as unknown as globalThis.Response);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Solana RPC request failed",
        details: "Internal Server Error",
      });
    });
  });

  describe("network errors", () => {
    it("should return 500 when fetch fails", async () => {
      mockReq.body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      };

      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });

    it("should return 500 when response.json() fails", async () => {
      mockReq.body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("JSON parsing error")),
      } as unknown as globalThis.Response);

      await POST(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Internal server error",
      });
    });
  });
});
