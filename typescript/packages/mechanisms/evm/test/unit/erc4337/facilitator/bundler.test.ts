import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BundlerClient } from "../../../../src/exact/facilitator/erc4337/bundler/client";
import { BundlerError } from "../../../../src/exact/facilitator/erc4337/bundler/types";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("BundlerClient", () => {
  const bundlerUrl = "https://bundler.example.com";
  let client: BundlerClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BundlerClient(bundlerUrl);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create client with default config", () => {
      const defaultClient = new BundlerClient(bundlerUrl);
      expect(defaultClient).toBeInstanceOf(BundlerClient);
    });

    it("should create client with custom config", () => {
      const customClient = new BundlerClient(bundlerUrl, {
        timeout: 5000,
        retries: 2,
      });
      expect(customClient).toBeInstanceOf(BundlerClient);
    });
  });

  describe("estimateUserOperationGas", () => {
    it("should estimate gas successfully", async () => {
      const mockGasEstimate = {
        callGasLimit: "0x1234",
        verificationGasLimit: "0x5678",
        preVerificationGas: "0x9abc",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: mockGasEstimate,
        }),
      });

      const userOp = {
        sender: "0x123",
        nonce: "0x0",
        callData: "0x",
      };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      const result = await client.estimateUserOperationGas(userOp, entryPoint);

      expect(result).toEqual(mockGasEstimate);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw BundlerError on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      await expect(client.estimateUserOperationGas(userOp, entryPoint)).rejects.toThrow(
        BundlerError,
      );
    });

    it("should throw BundlerError on RPC error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32602,
            message: "Invalid params",
          },
        }),
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      await expect(client.estimateUserOperationGas(userOp, entryPoint)).rejects.toThrow(
        BundlerError,
      );
    });

    it("should retry on failure when configured", async () => {
      const retryClient = new BundlerClient(bundlerUrl, { retries: 2 });

      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { callGasLimit: "0x1234" },
          }),
        });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      const result = await retryClient.estimateUserOperationGas(userOp, entryPoint);

      expect(result).toEqual({ callGasLimit: "0x1234" });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("sendUserOperation", () => {
    it("should send user operation successfully", async () => {
      const mockUserOpHash = "0xabcdef1234567890";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: mockUserOpHash,
        }),
      });

      const userOp = {
        sender: "0x123",
        nonce: "0x0",
        callData: "0x",
        signature: "0x",
      };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      const result = await client.sendUserOperation(userOp, entryPoint);

      expect(result).toBe(mockUserOpHash);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw BundlerError on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32603,
            message: "Internal error",
          },
        }),
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      await expect(client.sendUserOperation(userOp, entryPoint)).rejects.toThrow(BundlerError);
    });
  });

  describe("getUserOperationReceipt", () => {
    it("should get receipt successfully", async () => {
      const mockReceipt = {
        userOpHash: "0xabcdef",
        entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
        sender: "0x123",
        nonce: "0x0",
        success: true,
        receipt: {
          transactionHash: "0xtxhash",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: mockReceipt,
        }),
      });

      const userOpHash = "0xabcdef";

      const result = await client.getUserOperationReceipt(userOpHash);

      expect(result).toEqual(mockReceipt);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should return null when receipt not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: null,
        }),
      });

      const userOpHash = "0xabcdef";

      const result = await client.getUserOperationReceipt(userOpHash);

      expect(result).toBeNull();
    });

    it("should throw BundlerError on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      const userOpHash = "0xabcdef";

      await expect(client.getUserOperationReceipt(userOpHash)).rejects.toThrow(BundlerError);
    });
  });

  describe("timeout handling", () => {
    it("should timeout after configured duration", async () => {
      vi.useFakeTimers();
      const timeoutClient = new BundlerClient(bundlerUrl, { timeout: 50 });

      // Mock a fetch that respects abort signal and takes longer than timeout
      mockFetch.mockImplementation((_url: string, options?: { signal?: AbortSignal }) => {
        return new Promise((resolve, reject) => {
          // Check if already aborted
          if (options?.signal?.aborted) {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
            return;
          }

          // Set up a timeout that will resolve after the abort
          const timeoutId = setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ jsonrpc: "2.0", id: 1, result: {} }),
              }),
            200,
          );

          // Handle abort signal
          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              const abortError = new Error("Aborted");
              abortError.name = "AbortError";
              reject(abortError);
            });
          }
        });
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      const promise = timeoutClient.estimateUserOperationGas(userOp, entryPoint);

      // Advance time to trigger the abort timeout
      vi.advanceTimersByTime(60);

      // Wait for the promise to reject and catch it properly
      try {
        await promise;
        expect.fail("Should have thrown BundlerError");
      } catch (error) {
        expect(error).toBeInstanceOf(BundlerError);
      }

      // Clean up: advance timers to clear any remaining timers
      vi.advanceTimersByTime(200);
      // Wait for any pending microtasks
      await Promise.resolve();
      vi.useRealTimers();
    });
  });

  describe("error details", () => {
    it("should include error details in BundlerError", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32602,
            message: "Invalid params",
            data: { param: "userOp" },
          },
        }),
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      try {
        await client.estimateUserOperationGas(userOp, entryPoint);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(BundlerError);
        if (error instanceof BundlerError) {
          expect(error.code).toBe(-32602);
          expect(error.message).toContain("Invalid params");
          expect(error.data).toEqual({ param: "userOp" });
          expect(error.method).toBe("eth_estimateUserOperationGas");
          expect(error.bundlerUrl).toBe(bundlerUrl);
        }
      }
    });

    it("should handle missing result in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          // No result field
        }),
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      await expect(client.estimateUserOperationGas(userOp, entryPoint)).rejects.toThrow(
        BundlerError,
      );
    });

    it("should fallback to 'Bundler RPC error' when RPC error has no message field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32000,
            // message is missing
          },
        }),
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      try {
        await client.estimateUserOperationGas(userOp, entryPoint);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(BundlerError);
        if (error instanceof BundlerError) {
          expect(error.message).toBe("Bundler RPC error");
          expect(error.code).toBe(-32000);
        }
      }
    });
  });

  describe("BundlerError constructor", () => {
    it("should create BundlerError without options", () => {
      const error = new BundlerError("Simple error");
      expect(error).toBeInstanceOf(BundlerError);
      expect(error.message).toBe("Simple error");
      expect(error.name).toBe("BundlerError");
      expect(error.code).toBeUndefined();
      expect(error.data).toBeUndefined();
      expect(error.method).toBeUndefined();
      expect(error.bundlerUrl).toBeUndefined();
    });

    it("should create BundlerError with all options", () => {
      const cause = new Error("root cause");
      const error = new BundlerError("Detailed error", {
        code: -32602,
        data: { extra: "info" },
        method: "eth_sendUserOperation",
        bundlerUrl: "https://bundler.example.com",
        cause,
      });

      expect(error.message).toBe("Detailed error");
      expect(error.code).toBe(-32602);
      expect(error.data).toEqual({ extra: "info" });
      expect(error.method).toBe("eth_sendUserOperation");
      expect(error.bundlerUrl).toBe("https://bundler.example.com");
      expect(error.cause).toBe(cause);
    });
  });

  describe("retry logic", () => {
    it("should not retry on abort error (timeout)", async () => {
      const retryClient = new BundlerClient(bundlerUrl, { retries: 2 });

      // Mock fetch that aborts immediately
      mockFetch.mockImplementation(() => {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        return Promise.reject(abortError);
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      await expect(retryClient.estimateUserOperationGas(userOp, entryPoint)).rejects.toThrow(
        BundlerError,
      );

      // Should only try once (no retries on abort)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should wrap non-BundlerError on last retry attempt", async () => {
      const retryClient = new BundlerClient(bundlerUrl, { retries: 1 });

      // Both attempts fail with generic Error (not BundlerError, not AbortError)
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error again"));

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      try {
        await retryClient.estimateUserOperationGas(userOp, entryPoint);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(BundlerError);
        if (error instanceof BundlerError) {
          expect(error.message).toContain("Bundler request failed");
          expect(error.method).toBe("eth_estimateUserOperationGas");
          expect(error.bundlerUrl).toBe(bundlerUrl);
          expect(error.cause).toBeInstanceOf(Error);
        }
      }

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should re-throw BundlerError directly on last retry attempt", async () => {
      const retryClient = new BundlerClient(bundlerUrl, { retries: 1 });

      // First attempt: generic error (retryable), second: HTTP error (BundlerError)
      mockFetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      try {
        await retryClient.estimateUserOperationGas(userOp, entryPoint);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(BundlerError);
        if (error instanceof BundlerError) {
          expect(error.message).toContain("Bundler HTTP error: 503");
        }
      }

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should wrap non-Error throw on last retry", async () => {
      const retryClient = new BundlerClient(bundlerUrl, { retries: 0 });

      // Throw a non-Error value
      mockFetch.mockRejectedValueOnce("string error");

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      try {
        await retryClient.estimateUserOperationGas(userOp, entryPoint);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(BundlerError);
        if (error instanceof BundlerError) {
          expect(error.message).toContain("Bundler request failed");
        }
      }
    });

    it("should retry on network errors", async () => {
      const retryClient = new BundlerClient(bundlerUrl, { retries: 1 });

      mockFetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: { callGasLimit: "0x1234" },
        }),
      });

      const userOp = { sender: "0x123" };
      const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

      const result = await retryClient.estimateUserOperationGas(userOp, entryPoint);

      expect(result).toEqual({ callGasLimit: "0x1234" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
