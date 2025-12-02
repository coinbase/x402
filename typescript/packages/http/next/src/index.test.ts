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

// Mock @x402/extensions/bazaar
vi.mock("@x402/extensions/bazaar", () => ({
  bazaarResourceServerExtension: { name: "bazaar" },
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
 * @param settlementHeaders - Headers to return from processSettlement.
 * @returns A mock x402HTTPResourceServer.
 */
function createMockHttpServer(
  processResult: HTTPProcessResult,
  settlementHeaders: Record<string, string> | null = null,
): x402HTTPResourceServer {
  return {
    processHTTPRequest: vi.fn().mockResolvedValue(processResult),
    processSettlement: vi.fn().mockResolvedValue(settlementHeaders),
    registerPaywallProvider: vi.fn(),
  } as unknown as x402HTTPResourceServer;
}

/**
 * Creates a mock NextRequest for testing.
 *
 * @param path - The request path.
 * @returns A mock NextRequest.
 */
function createMockRequest(path = "/api/test"): NextRequest {
  return new NextRequest(`https://example.com${path}`, { method: "GET" });
}

/**
 * Sets up the mock createHttpServer to return the given server.
 *
 * @param mockServer - The mock server to return.
 */
function setupMockCreateHttpServer(mockServer: x402HTTPResourceServer): void {
  vi.mocked(createHttpServer).mockReturnValue({
    httpServer: mockServer,
    init: vi.fn().mockResolvedValue(undefined),
  });
}

// --- Tests ---
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
    expect(mockServer.processHTTPRequest).toHaveBeenCalled();
  });

  it("returns 402 HTML for payment-error with isHtml", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        body: "<html>Paywall</html>",
        headers: {},
        isHtml: true,
      },
    });
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("text/html");
  });

  it("returns 402 JSON for payment-error", async () => {
    const mockServer = createMockHttpServer({
      type: "payment-error",
      response: {
        status: 402,
        body: { error: "Payment required" },
        headers: {},
        isHtml: false,
      },
    });
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("settles and returns response for payment-verified", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { "X-Payment-Response": "settled" },
    );
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Payment-Response")).toBe("settled");
    expect(mockServer.processSettlement).toHaveBeenCalledWith(
      mockPaymentPayload,
      mockPaymentRequirements,
      200,
    );
  });

  it("passes paywallConfig to processHTTPRequest", async () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const paywallConfig = { cdpClientKey: "test-key" };

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
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      null,
    );
    vi.mocked(mockServer.processSettlement).mockRejectedValue(new Error("Settlement rejected"));
    setupMockCreateHttpServer(mockServer);

    const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
    const response = await proxy(createMockRequest());

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: string; details: string };
    expect(body.error).toBe("Settlement failed");
    expect(body.details).toBe("Settlement rejected");
  });

  // it("returns 402 when settlement returns success: false, not the resource", async () => {
  //   const mockServer = createMockHttpServer(
  //     {
  //       type: "payment-verified",
  //       paymentPayload: mockPaymentPayload,
  //       paymentRequirements: mockPaymentRequirements,
  //     },
  //     {
  //       "PAYMENT-RESPONSE": Buffer.from(
  //         JSON.stringify({
  //           success: false,
  //           errorReason: "Insufficient funds",
  //           transaction: "",
  //           network: "eip155:84532",
  //         }),
  //       ).toString("base64"),
  //     },
  //   );
  //   setupMockCreateHttpServer(mockServer);

  //   const proxy = paymentProxy(mockRoutes, {} as unknown as x402ResourceServer);
  //   const response = await proxy(createMockRequest());

  //   // When settlement returns success: false, should return 402, not the resource
  //   expect(response.status).toBe(402);
  // });
});

describe("withX402", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls handler when no-payment-required", async () => {
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "test" }));

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
        body: { error: "Payment required" },
        headers: {},
        isHtml: false,
      },
    });
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "test" }));

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
      { "X-Payment-Response": "settled" },
    );
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ data: "test" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Payment-Response")).toBe("settled");
  });

  it("skips settlement when handler returns >= 400", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      { "X-Payment-Response": "settled" },
    );
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(new NextResponse("Internal Error", { status: 500 }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(mockServer.processSettlement).not.toHaveBeenCalled();
  });

  it("returns 402 when settlement throws error, not the handler response", async () => {
    const mockServer = createMockHttpServer(
      {
        type: "payment-verified",
        paymentPayload: mockPaymentPayload,
        paymentRequirements: mockPaymentRequirements,
      },
      null,
    );
    vi.mocked(mockServer.processSettlement).mockRejectedValue(new Error("Settlement rejected"));
    setupMockCreateHttpServer(mockServer);
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ secret: "protected-data" }));

    const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
    const response = await wrappedHandler(createMockRequest());

    expect(handler).toHaveBeenCalled();
    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: string; details: string };
    expect(body.error).toBe("Settlement failed");
    expect(body).not.toHaveProperty("secret");
  });

  // it("returns 402 when settlement returns success: false, not the handler response", async () => {
  //   const mockServer = createMockHttpServer(
  //     {
  //       type: "payment-verified",
  //       paymentPayload: mockPaymentPayload,
  //       paymentRequirements: mockPaymentRequirements,
  //     },
  //     {
  //       "PAYMENT-RESPONSE": Buffer.from(
  //         JSON.stringify({
  //           success: false,
  //           errorReason: "Insufficient funds",
  //           transaction: "",
  //           network: "eip155:84532",
  //         }),
  //       ).toString("base64"),
  //     },
  //   );
  //   setupMockCreateHttpServer(mockServer);
  //   const handler = vi
  //     .fn()
  //     .mockResolvedValue(NextResponse.json({ secret: "protected-data" }));

  //   const wrappedHandler = withX402(handler, mockRouteConfig, {} as unknown as x402ResourceServer);
  //   const response = await wrappedHandler(createMockRequest());

  //   expect(handler).toHaveBeenCalled();
  //   // When settlement returns success: false, should return 402, not the handler response
  //   expect(response.status).toBe(402);
  //   const body = await response.json();
  //   expect(body).not.toHaveProperty("secret");
  // });
});

describe("paymentProxyFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to actually create server instance
    const mockServer = createMockHttpServer({ type: "no-payment-required" });
    setupMockCreateHttpServer(mockServer);
  });

  it("creates x402ResourceServer with facilitator clients", () => {
    const facilitator = { verify: vi.fn(), settle: vi.fn() } as unknown as FacilitatorClient;

    paymentProxyFromConfig(mockRoutes, facilitator);

    expect(x402ResourceServer).toHaveBeenCalledWith(facilitator);
  });

  it("registers bazaar extension", () => {
    paymentProxyFromConfig(mockRoutes);

    const serverInstance = vi.mocked(x402ResourceServer).mock.results[0].value;
    expect(serverInstance.registerExtension).toHaveBeenCalledWith({ name: "bazaar" });
  });

  it("registers scheme servers for each network", () => {
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
    const paywallConfig = { cdpClientKey: "key" };

    paymentProxyFromConfig(mockRoutes, undefined, undefined, paywallConfig, paywall, false);

    expect(createHttpServer).toHaveBeenCalledWith(mockRoutes, expect.anything(), paywall, false);
  });
});
