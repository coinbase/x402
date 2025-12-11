import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type {
  HTTPProcessResult,
  x402HTTPResourceServer,
  PaywallProvider,
  FacilitatorClient,
} from "@x402/core/server";
import {
  x402ResourceServer,
  x402HTTPResourceServer as HTTPResourceServer,
} from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements, SchemeNetworkServer } from "@x402/core/types";
import { paymentMiddleware, paymentMiddlewareFromConfig, type SchemeRegistration } from "./index";

// --- Test Fixtures ---
const mockRoutes = {
  "/api/*": {
    accepts: { scheme: "exact", payTo: "0x123", price: "$0.01", network: "eip155:84532" },
  },
} as const;

const mockPaymentPayload = {
  scheme: "exact",
  network: "eip155:84532",
  payload: { signature: "0xabc" },
} as unknown as PaymentPayload;

const mockPaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  maxAmountRequired: "1000",
  payTo: "0x123",
} as unknown as PaymentRequirements;

// --- Mock setup ---
let mockProcessHTTPRequest: ReturnType<typeof vi.fn>;
let mockProcessSettlement: ReturnType<typeof vi.fn>;
let mockRegisterPaywallProvider: ReturnType<typeof vi.fn>;
let mockRequiresPayment: ReturnType<typeof vi.fn>;

vi.mock("@x402/core/server", () => ({
  x402ResourceServer: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    registerExtension: vi.fn(),
    register: vi.fn(),
  })),
  x402HTTPResourceServer: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    processHTTPRequest: mockProcessHTTPRequest,
    processSettlement: mockProcessSettlement,
    registerPaywallProvider: mockRegisterPaywallProvider,
    requiresPayment: mockRequiresPayment,
  })),
}));

// --- Mock Factories ---
/**
 * Sets up the mock HTTP server to return specified results.
 *
 * @param processResult - The result to return from processHTTPRequest.
 * @param settlementResult - Result to return from processSettlement.
 */
function setupMockHttpServer(
  processResult: HTTPProcessResult,
  settlementResult:
    | { success: true; headers: Record<string, string> }
    | { success: false; errorReason: string } = { success: true, headers: {} },
): void {
  mockProcessHTTPRequest.mockResolvedValue(processResult);
  mockProcessSettlement.mockResolvedValue(settlementResult);
}

/**
 * Creates a mock Express Request for testing.
 *
 * @param options - Configuration options for the mock request.
 * @param options.path - The request URL path.
 * @param options.method - The HTTP method.
 * @param options.headers - Request headers.
 * @returns A mock Express Request.
 */
function createMockRequest(
  options: {
    path?: string;
    method?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers = options.headers || {};
  return {
    path: options.path || "/api/test",
    method: options.method || "GET",
    header: vi.fn((name: string) => headers[name.toLowerCase()]),
    headers: headers,
  } as unknown as Request;
}

/**
 * Creates a mock Express Response for testing.
 *
 * @returns A mock Express Response with tracking for method calls.
 */
function createMockResponse(): Response & {
  _status: number;
  _headers: Record<string, string>;
  _body: unknown;
  _ended: boolean;
} {
  const res = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _body: undefined as unknown,
    _ended: false,
    statusCode: 200,
    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code;
      this.statusCode = code;
      return this;
    }),
    setHeader: vi.fn(function (this: typeof res, key: string, value: string) {
      this._headers[key] = value;
      return this;
    }),
    json: vi.fn(function (this: typeof res, body: unknown) {
      this._body = body;
      this._ended = true;
      return this;
    }),
    send: vi.fn(function (this: typeof res, body: unknown) {
      this._body = body;
      this._ended = true;
      return this;
    }),
    writeHead: vi.fn(function (this: typeof res) {
      return this;
    }),
    write: vi.fn(function () {
      return true;
    }),
    end: vi.fn(function (this: typeof res) {
      this._ended = true;
      return this;
    }),
    flushHeaders: vi.fn(),
  };
  return res as unknown as Response & typeof res;
}

// --- Tests ---
describe("paymentMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessHTTPRequest = vi.fn();
    mockProcessSettlement = vi.fn();
    mockRegisterPaywallProvider = vi.fn();
    mockRequiresPayment = vi.fn().mockReturnValue(true);

    // Reset the mock implementation
    vi.mocked(HTTPResourceServer).mockImplementation(
      () =>
        ({
          processHTTPRequest: mockProcessHTTPRequest,
          processSettlement: mockProcessSettlement,
          registerPaywallProvider: mockRegisterPaywallProvider,
          requiresPayment: mockRequiresPayment,
        }) as unknown as x402HTTPResourceServer,
    );
  });

  it("calls next() when no-payment-required", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockProcessHTTPRequest).toHaveBeenCalled();
  });

  it("returns 402 HTML for payment-error with isHtml", async () => {
    setupMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        body: "<html>Paywall</html>",
        headers: {},
        isHtml: true,
      },
    });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.send).toHaveBeenCalledWith("<html>Paywall</html>");
  });

  it("returns 402 JSON for payment-error", async () => {
    setupMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        body: { error: "Payment required" },
        headers: {},
        isHtml: false,
      },
    });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({ error: "Payment required" });
  });

  it("sets custom headers from payment-error response", async () => {
    setupMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        body: { error: "Payment required" },
        headers: { "X-Custom-Header": "custom-value" },
        isHtml: false,
      },
    });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("X-Custom-Header", "custom-value");
  });

  it("settles and returns response for payment-verified with successful handler", async () => {
    setupMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: true, headers: { "PAYMENT-RESPONSE": "settled" } },
    );

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn(() => {
      // Simulate handler calling res.end()
      res.statusCode = 200;
      res.end();
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockProcessSettlement).toHaveBeenCalledWith(mockPaymentPayload, mockPaymentRequirements);
    expect(res.setHeader).toHaveBeenCalledWith("PAYMENT-RESPONSE", "settled");
  });

  it("skips settlement when handler returns >= 400", async () => {
    setupMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: true, headers: { "PAYMENT-RESPONSE": "settled" } },
    );

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn(() => {
      // Simulate handler returning error
      res.statusCode = 500;
      res.end();
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockProcessSettlement).not.toHaveBeenCalled();
  });

  it("returns 402 when settlement throws error", async () => {
    setupMockHttpServer({
      type: "payment-verified",
      paymentPayload: mockPaymentPayload,
      paymentRequirements: mockPaymentRequirements,
    });
    mockProcessSettlement.mockRejectedValue(new Error("Settlement rejected"));

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn(() => {
      res.statusCode = 200;
      res.end();
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: "Settlement failed",
      details: "Settlement rejected",
    });
  });

  it("returns 402 when settlement returns success: false", async () => {
    setupMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: false, errorReason: "Insufficient funds" },
    );

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn(() => {
      res.statusCode = 200;
      res.end();
    });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith({
      error: "Settlement failed",
      details: "Insufficient funds",
    });
  });

  it("passes paywallConfig to processHTTPRequest", async () => {
    setupMockHttpServer({ type: "no-payment-required" });
    const paywallConfig = { appName: "test-app" };

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      paywallConfig,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockProcessHTTPRequest).toHaveBeenCalledWith(expect.anything(), paywallConfig);
  });

  it("registers custom paywall provider", () => {
    setupMockHttpServer({ type: "no-payment-required" });
    const paywall: PaywallProvider = { generateHtml: vi.fn() };

    paymentMiddleware(mockRoutes, {} as unknown as x402ResourceServer, undefined, paywall, false);

    expect(mockRegisterPaywallProvider).toHaveBeenCalledWith(paywall);
  });
});

describe("paymentMiddlewareFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessHTTPRequest = vi.fn();
    mockProcessSettlement = vi.fn();
    mockRegisterPaywallProvider = vi.fn();
    mockRequiresPayment = vi.fn().mockReturnValue(true);

    vi.mocked(HTTPResourceServer).mockImplementation(
      () =>
        ({
          initialize: vi.fn().mockResolvedValue(undefined),
          processHTTPRequest: mockProcessHTTPRequest,
          processSettlement: mockProcessSettlement,
          registerPaywallProvider: mockRegisterPaywallProvider,
          requiresPayment: mockRequiresPayment,
        }) as unknown as x402HTTPResourceServer,
    );

    vi.mocked(x402ResourceServer).mockImplementation(
      () =>
        ({
          initialize: vi.fn().mockResolvedValue(undefined),
          registerExtension: vi.fn(),
          register: vi.fn(),
        }) as unknown as x402ResourceServer,
    );
  });

  it("creates x402ResourceServer with facilitator clients", () => {
    setupMockHttpServer({ type: "no-payment-required" });
    const facilitator = { verify: vi.fn(), settle: vi.fn() } as unknown as FacilitatorClient;

    paymentMiddlewareFromConfig(mockRoutes, facilitator);

    expect(x402ResourceServer).toHaveBeenCalledWith(facilitator);
  });

  it("registers scheme servers for each network", () => {
    setupMockHttpServer({ type: "no-payment-required" });
    const schemeServer = { verify: vi.fn(), settle: vi.fn() } as unknown as SchemeNetworkServer;
    const schemes: SchemeRegistration[] = [
      { network: "eip155:84532", server: schemeServer },
      { network: "eip155:8453", server: schemeServer },
    ];

    paymentMiddlewareFromConfig(mockRoutes, undefined, schemes);

    const serverInstance = vi.mocked(x402ResourceServer).mock.results[0].value;
    expect(serverInstance.register).toHaveBeenCalledTimes(2);
    expect(serverInstance.register).toHaveBeenCalledWith("eip155:84532", schemeServer);
    expect(serverInstance.register).toHaveBeenCalledWith("eip155:8453", schemeServer);
  });

  it("returns a working middleware function", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddlewareFromConfig(mockRoutes);
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe("ExpressAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessHTTPRequest = vi.fn();
    mockProcessSettlement = vi.fn();
    mockRegisterPaywallProvider = vi.fn();
    mockRequiresPayment = vi.fn().mockReturnValue(true);

    vi.mocked(HTTPResourceServer).mockImplementation(
      () =>
        ({
          processHTTPRequest: mockProcessHTTPRequest,
          processSettlement: mockProcessSettlement,
          registerPaywallProvider: mockRegisterPaywallProvider,
          requiresPayment: mockRequiresPayment,
        }) as unknown as x402HTTPResourceServer,
    );
  });

  it("extracts path and method from request", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest({ path: "/api/weather", method: "POST" });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockProcessHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/weather",
        method: "POST",
      }),
      undefined,
    );
  });

  it("extracts x-payment header", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest({ headers: { "x-payment": "payment-data" } });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockProcessHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentHeader: "payment-data",
      }),
      undefined,
    );
  });

  it("extracts payment-signature header (v2)", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest({ headers: { "payment-signature": "sig-data" } });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockProcessHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentHeader: "sig-data",
      }),
      undefined,
    );
  });

  it("prefers payment-signature over x-payment", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest({
      headers: { "payment-signature": "sig-data", "x-payment": "x-payment-data" },
    });
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockProcessHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentHeader: "sig-data",
      }),
      undefined,
    );
  });

  it("returns undefined paymentHeader when no payment headers present", async () => {
    setupMockHttpServer({ type: "no-payment-required" });

    const middleware = paymentMiddleware(
      mockRoutes,
      {} as unknown as x402ResourceServer,
      undefined,
      undefined,
      false,
    );
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockProcessHTTPRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentHeader: undefined,
      }),
      undefined,
    );
  });
});
