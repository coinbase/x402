import { describe, it, expect, vi, beforeEach } from "vitest";
import { wrapFetchWithPayment, wrapFetchWithPaymentFromConfig } from "./index";
import type { x402Client, x402HTTPClient, x402ClientConfig } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";

// Mock the @x402/core/client module
vi.mock("@x402/core/client", () => {
  const MockX402HTTPClient = vi.fn();
  MockX402HTTPClient.prototype.getPaymentRequiredResponse = vi.fn();
  MockX402HTTPClient.prototype.encodePaymentSignatureHeader = vi.fn();

  const MockX402Client = vi.fn() as ReturnType<typeof vi.fn> & {
    fromConfig: ReturnType<typeof vi.fn>;
  };
  MockX402Client.prototype.createPaymentPayload = vi.fn();
  MockX402Client.fromConfig = vi.fn();

  return {
    x402HTTPClient: MockX402HTTPClient,
    x402Client: MockX402Client,
  };
});

type RequestInitWithRetry = RequestInit & { __is402Retry?: boolean };

describe("wrapFetchWithPayment()", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockClient: x402Client;
  let wrappedFetch: ReturnType<typeof wrapFetchWithPayment>;

  const validPaymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: {
      url: "https://api.example.com/resource",
      description: "Test payment",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:84532" as const,
        amount: "1000000",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        payTo: "0x1234567890123456789012345678901234567890",
        maxTimeoutSeconds: 300,
        extra: {},
      } as PaymentRequirements,
    ],
  };

  const validPaymentPayload: PaymentPayload = {
    x402Version: 2,
    resource: validPaymentRequired.resource,
    accepted: validPaymentRequired.accepts[0],
    payload: { signature: "0xmocksignature" },
  };

  const createResponse = (
    status: number,
    data?: unknown,
    headers?: Record<string, string>,
  ): Response => {
    return new Response(data ? JSON.stringify(data) : null, {
      status,
      statusText: status === 402 ? "Payment Required" : "OK",
      headers: new Headers(headers),
    });
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockFetch = vi.fn();

    // Create mock client
    const { x402Client: MockX402Client, x402HTTPClient: MockX402HTTPClient } = await import(
      "@x402/core/client"
    );

    mockClient = new MockX402Client() as unknown as x402Client;

    // Setup default mock implementations
    (mockClient.createPaymentPayload as ReturnType<typeof vi.fn>).mockResolvedValue(
      validPaymentPayload,
    );

    (
      MockX402HTTPClient.prototype.getPaymentRequiredResponse as ReturnType<typeof vi.fn>
    ).mockReturnValue(validPaymentRequired);
    (
      MockX402HTTPClient.prototype.encodePaymentSignatureHeader as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      "PAYMENT-SIGNATURE": "encoded-payment-header",
    });

    wrappedFetch = wrapFetchWithPayment(mockFetch, mockClient);
  });

  it("should return the original response for non-402 status codes", async () => {
    const successResponse = createResponse(200, { data: "success" });
    mockFetch.mockResolvedValue(successResponse);

    const result = await wrappedFetch("https://api.example.com", { method: "GET" });

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com", { method: "GET" });
  });

  it("should handle 402 errors and retry with payment header", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");
    const successResponse = createResponse(200, { data: "success" });

    mockFetch
      .mockResolvedValueOnce(
        createResponse(402, validPaymentRequired, { "PAYMENT-REQUIRED": "encoded-header" }),
      )
      .mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    } as RequestInitWithRetry);

    expect(result).toBe(successResponse);
    expect(MockX402HTTPClient.prototype.getPaymentRequiredResponse).toHaveBeenCalled();
    expect(mockClient.createPaymentPayload).toHaveBeenCalledWith(validPaymentRequired);
    expect(MockX402HTTPClient.prototype.encodePaymentSignatureHeader).toHaveBeenCalledWith(
      validPaymentPayload,
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith("https://api.example.com", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": "encoded-payment-header",
        "Access-Control-Expose-Headers": "PAYMENT-RESPONSE,X-PAYMENT-RESPONSE",
      },
      __is402Retry: true,
    } as RequestInitWithRetry);
  });

  it("should not retry if already retried", async () => {
    mockFetch.mockResolvedValue(createResponse(402, validPaymentRequired));

    await expect(
      wrappedFetch("https://api.example.com", {
        method: "GET",
        __is402Retry: true,
      } as RequestInitWithRetry),
    ).rejects.toThrow("Payment already attempted");
  });

  it("should reject if missing fetch request config", async () => {
    mockFetch.mockResolvedValue(createResponse(402, validPaymentRequired));

    await expect(wrappedFetch("https://api.example.com")).rejects.toThrow(
      "Missing fetch request configuration",
    );
  });

  it("should reject with descriptive error if payment requirements parsing fails", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");
    (
      MockX402HTTPClient.prototype.getPaymentRequiredResponse as ReturnType<typeof vi.fn>
    ).mockImplementation(() => {
      throw new Error("Invalid payment header format");
    });

    mockFetch.mockResolvedValue(createResponse(402, undefined));

    await expect(wrappedFetch("https://api.example.com", { method: "GET" })).rejects.toThrow(
      "Failed to parse payment requirements: Invalid payment header format",
    );
  });

  it("should reject with descriptive error if payment payload creation fails", async () => {
    const paymentError = new Error("Insufficient funds");
    (mockClient.createPaymentPayload as ReturnType<typeof vi.fn>).mockRejectedValue(paymentError);

    mockFetch.mockResolvedValue(createResponse(402, validPaymentRequired));

    await expect(wrappedFetch("https://api.example.com", { method: "GET" })).rejects.toThrow(
      "Failed to create payment payload: Insufficient funds",
    );
  });

  it("should reject with generic error message for unknown parsing errors", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");
    (
      MockX402HTTPClient.prototype.getPaymentRequiredResponse as ReturnType<typeof vi.fn>
    ).mockImplementation(() => {
      throw "String error"; // Non-Error thrown
    });

    mockFetch.mockResolvedValue(createResponse(402, undefined));

    await expect(wrappedFetch("https://api.example.com", { method: "GET" })).rejects.toThrow(
      "Failed to parse payment requirements: Unknown error",
    );
  });

  it("should reject with generic error message for unknown payment creation errors", async () => {
    (mockClient.createPaymentPayload as ReturnType<typeof vi.fn>).mockRejectedValue("String error");

    mockFetch.mockResolvedValue(createResponse(402, validPaymentRequired));

    await expect(wrappedFetch("https://api.example.com", { method: "GET" })).rejects.toThrow(
      "Failed to create payment payload: Unknown error",
    );
  });

  it("should handle v1 payment responses from body", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");
    const successResponse = createResponse(200, { data: "success" });

    const v1PaymentRequired: PaymentRequired = {
      ...validPaymentRequired,
      x402Version: 1,
    };

    const v1PaymentPayload: PaymentPayload = {
      ...validPaymentPayload,
      x402Version: 1,
    };

    (
      MockX402HTTPClient.prototype.getPaymentRequiredResponse as ReturnType<typeof vi.fn>
    ).mockReturnValue(v1PaymentRequired);
    (
      MockX402HTTPClient.prototype.encodePaymentSignatureHeader as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      "X-PAYMENT": "v1-payment-header",
    });
    (mockClient.createPaymentPayload as ReturnType<typeof vi.fn>).mockResolvedValue(
      v1PaymentPayload,
    );

    mockFetch.mockResolvedValueOnce(createResponse(402, v1PaymentRequired));
    mockFetch.mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", { method: "GET" });

    expect(result).toBe(successResponse);
    expect(MockX402HTTPClient.prototype.encodePaymentSignatureHeader).toHaveBeenCalledWith(
      v1PaymentPayload,
    );
    expect(mockFetch).toHaveBeenLastCalledWith(
      "https://api.example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-PAYMENT": "v1-payment-header",
        }),
      }),
    );
  });

  it("should propagate retry errors", async () => {
    const retryError = new Error("Network error on retry");

    mockFetch.mockResolvedValueOnce(createResponse(402, validPaymentRequired));
    mockFetch.mockRejectedValueOnce(retryError);

    await expect(wrappedFetch("https://api.example.com", { method: "GET" })).rejects.toBe(
      retryError,
    );
  });

  it("should set Access-Control-Expose-Headers on retry request", async () => {
    const successResponse = createResponse(200, { data: "success" });

    mockFetch.mockResolvedValueOnce(createResponse(402, validPaymentRequired));
    mockFetch.mockResolvedValueOnce(successResponse);

    await wrappedFetch("https://api.example.com", { method: "GET" });

    expect(mockFetch).toHaveBeenLastCalledWith(
      "https://api.example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Access-Control-Expose-Headers": "PAYMENT-RESPONSE,X-PAYMENT-RESPONSE",
        }),
      }),
    );
  });

  it("should handle empty response body gracefully", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");
    const successResponse = createResponse(200, { data: "success" });

    // Response with headers only, no body
    const headerOnlyResponse = new Response("", {
      status: 402,
      headers: new Headers({ "PAYMENT-REQUIRED": "encoded-header" }),
    });

    mockFetch.mockResolvedValueOnce(headerOnlyResponse);
    mockFetch.mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", { method: "GET" });

    expect(result).toBe(successResponse);
    expect(MockX402HTTPClient.prototype.getPaymentRequiredResponse).toHaveBeenCalled();
  });

  it("should handle invalid JSON in response body gracefully", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");
    const successResponse = createResponse(200, { data: "success" });

    // Response with invalid JSON body
    const invalidJsonResponse = new Response("not valid json", {
      status: 402,
      headers: new Headers({ "PAYMENT-REQUIRED": "encoded-header" }),
    });

    mockFetch.mockResolvedValueOnce(invalidJsonResponse);
    mockFetch.mockResolvedValueOnce(successResponse);

    const result = await wrappedFetch("https://api.example.com", { method: "GET" });

    expect(result).toBe(successResponse);
    expect(MockX402HTTPClient.prototype.getPaymentRequiredResponse).toHaveBeenCalled();
  });

  it("should accept x402HTTPClient directly", async () => {
    const { x402HTTPClient: MockX402HTTPClient } = await import("@x402/core/client");

    const httpClient = new MockX402HTTPClient(mockClient) as unknown as x402HTTPClient;
    const wrappedWithHttpClient = wrapFetchWithPayment(mockFetch, httpClient);

    const successResponse = createResponse(200, { data: "success" });
    mockFetch.mockResolvedValue(successResponse);

    const result = await wrappedWithHttpClient("https://api.example.com", { method: "GET" });

    expect(result).toBe(successResponse);
  });
});

describe("wrapFetchWithPaymentFromConfig()", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetAllMocks();

    mockFetch = vi.fn();

    const { x402Client: MockX402Client, x402HTTPClient: MockX402HTTPClient } = await import(
      "@x402/core/client"
    );
    (MockX402Client.fromConfig as ReturnType<typeof vi.fn>).mockReturnValue(new MockX402Client());

    (
      MockX402HTTPClient.prototype.getPaymentRequiredResponse as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      x402Version: 2,
      resource: { url: "test", description: "test", mimeType: "text/plain" },
      accepts: [],
    });
  });

  it("should create client from config and wrap fetch", async () => {
    const { x402Client: MockX402Client } = await import("@x402/core/client");

    const config: x402ClientConfig = {
      schemes: [],
    };

    const wrappedFetch = wrapFetchWithPaymentFromConfig(mockFetch, config);

    expect(MockX402Client.fromConfig).toHaveBeenCalledWith(config);
    expect(typeof wrappedFetch).toBe("function");
  });

  it("should return wrapped fetch function", async () => {
    const config: x402ClientConfig = {
      schemes: [],
    };

    const wrappedFetch = wrapFetchWithPaymentFromConfig(mockFetch, config);
    const successResponse = new Response(JSON.stringify({ data: "success" }), { status: 200 });
    mockFetch.mockResolvedValue(successResponse);

    const result = await wrappedFetch("https://api.example.com", { method: "GET" });

    expect(result).toBe(successResponse);
    expect(mockFetch).toHaveBeenCalled();
  });
});
