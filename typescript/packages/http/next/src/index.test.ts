import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type {
  HTTPProcessResult,
  x402HTTPResourceServer,
  PaywallProvider,
  FacilitatorClient,
} from "@x402/core/server";
import { x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements, SchemeNetworkServer } from "@x402/core/types";
import { paymentProxy, paymentProxyFromConfig, withX402, type SchemeRegistration } from "./index";

import { createHttpServer } from "./utils";

// Mock utils
vi.mock("./utils", async () => {
  const actual = await vi.importActual("./utils");
  return {
    ...actual,
    createHttpServer: vi.fn(),
  };
});

// Mock @x402/core/server
vi.mock("@x402/core/server", () => ({
  x402ResourceServer: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    registerExtension: vi.fn(),
    register: vi.fn(),
  })),
  x402HTTPResourceServer: vi.fn(),
}));

// --- Test Fixtures ---
const mockRoutes = {
  "/api/*": {
    accepts: { scheme: "exact", payTo: "0x123", price: "$0.01", network: "eip155:84532" },
  },
} as const;

const mockRouteConfig = {
  accepts: { scheme: "exact", payTo: "0x123", price: "$0.01", network: "eip155:84532" },
  description: "Test route",
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

// --- Mock Factories ---
/**
 * Creates a mock HTTP server for testing.
 *
 * @param processResult - The result to return from processHTTPRequest.
 * @param settlementResult - Result to return from processSettlement (success with headers or failure).
 * @returns A mock x402HTTPResourceServer.
 */
function createMockHttpServer(
  processResult: HTTPProcessResult,
  settlementResult:
    | { success: true; headers: Record<string, string> }
    | { success: false; errorReason: string } = { success: true, headers: {} },
): x402HTTPResourceServer {
  return {
    processHTTPRequest: vi.fn().mockResolvedValue(processResult),
    processSettlement: vi.fn().mockResolvedValue(settlementResult),
    registerPaywallProvider: vi.fn(),
    requiresPayment: vi.fn().mockReturnValue(true),
  } as unknown as x402HTTPResourceServer;
}

/**
 * Creates a mock Next.js request for testing.
 *
 * @param options - Configuration options for the mock request.
 * @param options.url - The request URL.
 * @param options.method - The HTTP method.
 * @param options.headers - Request headers.
 * @returns A mock NextRequest.
 */
function createMockRequest(
  options: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const url = options.url || "https://example.com/api/test";
  return new NextRequest(url, {
    method: options.method || "GET",
    headers: options.headers,
  });
}

/**
 * Sets up createHttpServer mock to return the provided server.
 *
 * @param mockServer - The mock x402HTTPResourceServer to return.
 */
function setupMockCreateHttpServer(mockServer: x402HTTPResourceServer): void {
  vi.mocked(createHttpServer).mockReturnValue({
    httpServer: mockServer,
    init: vi.fn().mockResolvedValue(undefined),
  });
}

describe("paymentProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns NextResponse.next() when no-payment-required", async () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(200);
  });

  it("returns 402 HTML for payment-error with isHtml", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        headers: { "Content-Type": "text/html" },
        body: "<html>Payment Required</html>",
        isHtml: true,
      },
    });
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(await response.text()).toBe("<html>Payment Required</html>");
  });

  it("returns 402 JSON for payment-error", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        headers: { "X-Custom-Header": "custom-value" },
        body: { error: "Payment required" },
        isHtml: false,
      },
    });
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const body = await response.json();
    expect(body).toEqual({ error: "Payment required" });
  });

  it("settles and returns response for payment-verified", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: true, headers: { "X-Settlement": "complete" } },
    );
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Settlement")).toBe("complete");
    expect(mockServer.processSettlement).toHaveBeenCalledWith(
      mockPaymentPayload,
      mockPaymentRequirements,
    );
  });

  it("passes paywallConfig to processHTTPRequest", async () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const paywallConfig = { appName: "test-app", testnet: true };

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer, paywallConfig);
    await proxy(createMockRequest());

    expect(mockServer.processHTTPRequest).toHaveBeenCalledWith(expect.anything(), paywallConfig);
  });

  it("registers custom paywall provider", () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const paywall: PaywallProvider = { generateHtml: vi.fn() };

    paymentProxy(mockRoutes, {} as unknown as x402ResourceServer, undefined, paywall);

    expect(createHttpServer).toHaveBeenCalledWith(mockRoutes, expect.anything(), paywall, true);
  });

  it("returns 402 when settlement throws error", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-verified",
      paymentPayload: mockPaymentPayload,
      paymentRequirements: mockPaymentRequirements,
    });
    vi.mocked(mockServer.processSettlement).mockRejectedValue(new Error("Settlement rejected"));
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBe("Settlement failed");
  });

  it("returns 402 when settlement returns success: false, not the resource", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: false, errorReason: "Insufficient funds" },
    );
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBe("Settlement failed");
    expect(body.details).toBe("Insufficient funds");
  });
});

describe("withX402", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls handler when no-payment-required", async () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "protected" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("returns 402 without calling handler for payment-error", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        headers: {},
        body: { error: "Payment required" },
        isHtml: false,
      },
    });
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "protected" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(402);
  });

  it("calls handler and settles for payment-verified", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: true, headers: { "X-Settlement": "complete" } },
    );
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "protected" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Settlement")).toBe("complete");
  });

  it("skips settlement when handler returns >= 400", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-verified",
      paymentPayload: mockPaymentPayload,
      paymentRequirements: mockPaymentRequirements,
    });
    setupMockCreateHttpServer(mockServer);
    const handler = vi
      .fn()
      .mockResolvedValue(
        new NextResponse(JSON.stringify({ error: "Bad request" }), { status: 400 }),
      );

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(mockServer.processSettlement).not.toHaveBeenCalled();
  });

  it("returns 402 when settlement throws error, not the handler response", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-verified",
      paymentPayload: mockPaymentPayload,
      paymentRequirements: mockPaymentRequirements,
    });
    vi.mocked(mockServer.processSettlement).mockRejectedValue(new Error("Settlement rejected"));
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "protected" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBe("Settlement failed");
  });

  it("returns 402 when settlement returns success: false, not the handler response", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { success: false, errorReason: "Insufficient funds" },
    );
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "protected" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBe("Settlement failed");
    expect(body.details).toBe("Insufficient funds");
  });
});

describe("paymentProxyFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates x402ResourceServer with facilitator clients", () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const facilitator = { verify: vi.fn(), settle: vi.fn() } as unknown as FacilitatorClient;

    paymentProxyFromConfig(mockRoutes, facilitator);

    expect(x402ResourceServer).toHaveBeenCalledWith(facilitator);
  });

  it("registers scheme servers for each network", () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const schemeServer = { verify: vi.fn(), settle: vi.fn() } as unknown as SchemeNetworkServer;
    const schemes: SchemeRegistration[] = [
      { network: "eip155:84532", server: schemeServer },
      { network: "eip155:8453", server: schemeServer },
    ];

    paymentProxyFromConfig(mockRoutes, undefined, schemes);

    const serverInstance = vi.mocked(x402ResourceServer).mock.results[0].value;
    expect(serverInstance.register).toHaveBeenCalledTimes(2);
    expect(serverInstance.register).toHaveBeenCalledWith("eip155:84532", schemeServer);
    expect(serverInstance.register).toHaveBeenCalledWith("eip155:8453", schemeServer);
  });

  it("returns a working proxy function", async () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxyFromConfig(mockRoutes);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(200);
  });

  it("passes all config options through to paymentProxy", () => {
    const paywall: PaywallProvider = { generateHtml: vi.fn() };
    const paywallConfig = { appName: "test-app" };

    paymentProxyFromConfig(mockRoutes, undefined, undefined, paywallConfig, paywall, false);

    expect(createHttpServer).toHaveBeenCalledWith(mockRoutes, expect.anything(), paywall, false);
  });
});
