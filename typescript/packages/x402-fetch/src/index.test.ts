import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { wrapFetchWithPayment } from "./index";
import type { evm, PaymentRequirements } from "x402/types";

vi.mock("x402/client", () => ({
  createPaymentHeader: vi.fn(),
  selectPaymentRequirements: vi.fn(),
}));

// Mock browser APIs
Object.defineProperty(globalThis, "fetch", {
  value: vi.fn(),
  writable: true,
});

type RequestInitWithRetry = RequestInit & { __is402Retry?: boolean };

describe("fetchWithPayment()", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockWalletClient: typeof evm.SignerWallet;
  let wrappedFetch: ReturnType<typeof wrapFetchWithPayment>;
  const validPaymentRequirements: PaymentRequirements[] = [
    {
      scheme: "exact",
      network: "base-sepolia",
      maxAmountRequired: "100000", // 0.1 USDC in base units
      resource: "https://api.example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
      payTo: "0x1234567890123456789012345678901234567890",
      maxTimeoutSeconds: 300,
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on base-sepolia
    },
  ];

  const createResponse = (status: number, data?: unknown): Response => {
    const response = new Response(JSON.stringify(data), {
      status,
      statusText: status === 402 ? "Payment Required" : status === 200 ? "OK" : "Not Found",
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    return response;
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockFetch = vi.fn();

    mockWalletClient = {
      signMessage: vi.fn(),
    } as unknown as typeof evm.SignerWallet;

    // Mock payment requirements selector
    const { selectPaymentRequirements } = await import("x402/client");
    (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
      (requirements, _) => requirements[0],
    );

    wrappedFetch = wrapFetchWithPayment(mockFetch, mockWalletClient);
  });

  describe("Custom fetch wrapper", () => {
    it("should return the original response for non-402 status codes", async () => {
      const successResponse = createResponse(200, { data: "success" });
      mockFetch.mockResolvedValue(successResponse);

      const result = await wrappedFetch("https://api.example.com");

      expect(result).toBe(successResponse);
      expect(mockFetch).toHaveBeenCalledWith("https://api.example.com", undefined);
    });

    it("should handle 402 errors and retry with payment header", async () => {
      const paymentHeader = "payment-header-value";
      const successResponse = createResponse(200, { data: "success" });

      const { createPaymentHeader, selectPaymentRequirements } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);
      (selectPaymentRequirements as ReturnType<typeof vi.fn>).mockImplementation(
        (requirements, _) => requirements[0],
      );
      mockFetch
        .mockResolvedValueOnce(
          createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
        )
        .mockResolvedValueOnce(successResponse);

      const result = await wrappedFetch("https://api.example.com", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      } as RequestInitWithRetry);

      expect(result).toBe(successResponse);
      expect(selectPaymentRequirements).toHaveBeenCalledWith(
        validPaymentRequirements,
        undefined,
        "exact",
      );
      expect(createPaymentHeader).toHaveBeenCalledWith(
        mockWalletClient,
        1,
        validPaymentRequirements[0],
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith("https://api.example.com", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
        __is402Retry: true,
      } as RequestInitWithRetry);
    });

    it("should not retry if already retried", async () => {
      const errorResponse = createResponse(402, {
        accepts: validPaymentRequirements,
        x402Version: 1,
      });
      mockFetch.mockResolvedValue(errorResponse);

      await expect(
        wrappedFetch("https://api.example.com", {
          __is402Retry: true,
        } as RequestInitWithRetry),
      ).rejects.toThrow("Payment already attempted");
    });

    it("should reject if missing request config", async () => {
      const errorResponse = createResponse(402, {
        accepts: validPaymentRequirements,
        x402Version: 1,
      });
      mockFetch.mockResolvedValue(errorResponse);

      await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
        "Missing fetch request configuration",
      );
    });

    it("should reject if payment amount exceeds maximum", async () => {
      const errorResponse = createResponse(402, {
        accepts: [
          {
            ...validPaymentRequirements[0],
            maxAmountRequired: "200000", // 0.2 USDC, which exceeds our default max of 0.1 USDC
          },
        ],
        x402Version: 1,
      });
      mockFetch.mockResolvedValue(errorResponse);

      await expect(
        wrappedFetch("https://api.example.com", {
          method: "GET",
        } as RequestInitWithRetry),
      ).rejects.toThrow("Payment amount exceeds maximum allowed");
    });

    it("should reject if payment header creation fails", async () => {
      const paymentError = new Error("Payment failed");
      const { createPaymentHeader } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockRejectedValue(paymentError);
      mockFetch.mockResolvedValue(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      );

      await expect(
        wrappedFetch("https://api.example.com", {
          method: "GET",
        } as RequestInitWithRetry),
      ).rejects.toBe(paymentError);
    });
  });

  describe("Browser fetch integration", () => {
    let originalFetch: typeof globalThis.fetch;
    let browserWrappedFetch: ReturnType<typeof wrapFetchWithPayment>;

    beforeEach(() => {
      // Store original fetch and set up mock
      originalFetch = globalThis.fetch;
      const mockBrowserFetch = vi.fn();
      globalThis.fetch = mockBrowserFetch;

      browserWrappedFetch = wrapFetchWithPayment(globalThis.fetch, mockWalletClient);
    });

    afterEach(() => {
      // Restore original fetch
      globalThis.fetch = originalFetch;
    });

    it("should work with browser's native fetch", async () => {
      const successResponse = createResponse(200, { data: "browser success" });
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      const result = await browserWrappedFetch("https://api.example.com/browser");

      expect(result).toBe(successResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith("https://api.example.com/browser", undefined);
    });

    it("should handle browser fetch with 402 payment flow", async () => {
      const paymentHeader = "browser-payment-header";
      const successResponse = createResponse(200, { data: "paid content" });

      const { createPaymentHeader } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
        )
        .mockResolvedValueOnce(successResponse);

      const result = await browserWrappedFetch("https://api.example.com/paid", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
        body: JSON.stringify({ test: "data" }),
      });

      expect(result).toBe(successResponse);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      // Verify first call (initial request)
      expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "https://api.example.com/paid", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
        body: JSON.stringify({ test: "data" }),
      });

      // Verify second call (with payment header)
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, "https://api.example.com/paid", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
        body: JSON.stringify({ test: "data" }),
        __is402Retry: true,
      });
    });

    it("should handle browser fetch with different request methods", async () => {
      const testCases = [
        { method: "GET", hasBody: false },
        { method: "POST", hasBody: true },
        { method: "PUT", hasBody: true },
        { method: "DELETE", hasBody: false },
        { method: "PATCH", hasBody: true },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        const successResponse = createResponse(200, { method: testCase.method });
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

        const requestInit: RequestInit = {
          method: testCase.method,
          headers: { "Content-Type": "application/json" },
          ...(testCase.hasBody && { body: JSON.stringify({ data: "test" }) }),
        };

        const result = await browserWrappedFetch(
          `https://api.example.com/${testCase.method.toLowerCase()}`,
          requestInit,
        );

        expect(result).toBe(successResponse);
        expect(globalThis.fetch).toHaveBeenCalledWith(
          `https://api.example.com/${testCase.method.toLowerCase()}`,
          requestInit,
        );
      }
    });

    it("should preserve request headers and body in browser fetch retry", async () => {
      const paymentHeader = "browser-retry-payment";
      const successResponse = createResponse(200, { data: "retry success" });
      const requestBody = JSON.stringify({ important: "data" });

      const { createPaymentHeader } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);

      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
        )
        .mockResolvedValueOnce(successResponse);

      const result = await browserWrappedFetch("https://api.example.com/preserve", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
          "X-Custom-Header": "custom-value",
        },
        body: requestBody,
      });

      expect(result).toBe(successResponse);

      // Verify the retry call preserves all original headers plus payment header
      expect(globalThis.fetch).toHaveBeenLastCalledWith("https://api.example.com/preserve", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token",
          "X-Custom-Header": "custom-value",
          "X-PAYMENT": paymentHeader,
          "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE",
        },
        body: requestBody,
        __is402Retry: true,
      });
    });

    it("should handle browser fetch network errors", async () => {
      const networkError = new Error("Failed to fetch");
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(networkError);

      await expect(browserWrappedFetch("https://api.example.com/network-error")).rejects.toThrow(
        "Failed to fetch",
      );
    });

    it("should handle browser fetch with AbortController", async () => {
      const controller = new AbortController();
      const successResponse = createResponse(200, { data: "abortable" });
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(successResponse);

      // Test that signal is passed through
      const result = await browserWrappedFetch("https://api.example.com/abort", {
        signal: controller.signal,
      });

      expect(result).toBe(successResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith("https://api.example.com/abort", {
        signal: controller.signal,
      });
    });

    it("should handle browser fetch timeout scenarios", async () => {
      const paymentHeader = "timeout-payment";
      const { createPaymentHeader } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockResolvedValue(paymentHeader);

      // Mock a slow initial request that returns 402, then fast payment response
      (globalThis.fetch as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(
          () =>
            new Promise(resolve =>
              setTimeout(
                () =>
                  resolve(
                    createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
                  ),
                100,
              ),
            ),
        )
        .mockResolvedValueOnce(createResponse(200, { data: "eventually successful" }));

      const result = await browserWrappedFetch("https://api.example.com/slow", {
        method: "GET",
      });

      expect(result.status).toBe(200);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error handling with browser fetch", () => {
    let browserWrappedFetch: ReturnType<typeof wrapFetchWithPayment>;

    beforeEach(() => {
      const mockBrowserFetch = vi.fn();
      globalThis.fetch = mockBrowserFetch;
      browserWrappedFetch = wrapFetchWithPayment(globalThis.fetch, mockWalletClient);
    });

    it("should handle malformed 402 responses in browser", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        new Response("Invalid JSON", { status: 402 }),
      );

      await expect(browserWrappedFetch("https://api.example.com/malformed")).rejects.toThrow();
    });

    it("should handle missing payment requirements in browser", async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        createResponse(402, { x402Version: 1 }),
      );

      await expect(
        browserWrappedFetch("https://api.example.com/missing-accepts"),
      ).rejects.toThrow();
    });

    it("should propagate wallet errors in browser context", async () => {
      const walletError = new Error("Wallet connection failed");
      mockWalletClient.signMessage = vi.fn().mockRejectedValue(walletError);

      const { createPaymentHeader } = await import("x402/client");
      (createPaymentHeader as ReturnType<typeof vi.fn>).mockRejectedValue(walletError);

      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        createResponse(402, { accepts: validPaymentRequirements, x402Version: 1 }),
      );

      await expect(
        browserWrappedFetch("https://api.example.com/wallet-error", { method: "GET" }),
      ).rejects.toThrow("Wallet connection failed");
    });
  });
});
