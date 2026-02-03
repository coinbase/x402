/**
 * Unit tests for x402MCPServer and createPaymentWrapper
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { x402MCPServer, createx402MCPServer, createPaymentWrapper } from "../../src/server";
import { MCP_PAYMENT_REQUIRED_CODE, MCP_PAYMENT_RESPONSE_META_KEY } from "../../src/types";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { z } from "zod";

// ============================================================================
// Mock Types
// ============================================================================

interface MockMcpServer {
  tool: ReturnType<typeof vi.fn>;
  resource: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
}

interface MockResourceServer {
  initialize: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  verifyPayment: ReturnType<typeof vi.fn>;
  settlePayment: ReturnType<typeof vi.fn>;
  buildPaymentRequirements: ReturnType<typeof vi.fn>;
  createPaymentRequiredResponse: ReturnType<typeof vi.fn>;
}

// ============================================================================
// Test Fixtures
// ============================================================================

const mockPaymentRequirements: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:84532",
  amount: "1000",
  asset: "0xtoken",
  payTo: "0xrecipient",
  maxTimeoutSeconds: 60,
  extra: {},
};

const mockPaymentPayload: PaymentPayload = {
  x402Version: 2,
  payload: {
    signature: "0x123",
    authorization: {
      from: "0xabc",
      to: "0xdef",
      value: "1000",
      validAfter: 0,
      validBefore: Math.floor(Date.now() / 1000) + 3600,
      nonce: "0x1",
    },
  },
};

const mockVerifyResponse: VerifyResponse = {
  isValid: true,
};

const mockSettleResponse: SettleResponse = {
  success: true,
  transaction: "0xtxhash123",
  network: "eip155:84532",
};

const mockPaymentRequired = {
  x402Version: 2,
  accepts: [mockPaymentRequirements],
  error: "Payment required",
  resource: {
    url: "mcp://tool/test",
    description: "Test tool",
    mimeType: "application/json",
  },
};

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Creates a mock MCP server for testing
 *
 * @returns Mock MCP server instance
 */
function createMockMcpServer(): MockMcpServer {
  return {
    tool: vi.fn(),
    resource: vi.fn(),
    prompt: vi.fn(),
  };
}

/**
 * Creates a mock x402 resource server for testing
 *
 * @returns Mock resource server instance
 */
function createMockResourceServer(): MockResourceServer {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    verifyPayment: vi.fn().mockResolvedValue(mockVerifyResponse),
    settlePayment: vi.fn().mockResolvedValue(mockSettleResponse),
    buildPaymentRequirements: vi.fn().mockResolvedValue([mockPaymentRequirements]),
    createPaymentRequiredResponse: vi.fn().mockResolvedValue(mockPaymentRequired),
  };
}

// ============================================================================
// x402MCPServer Tests
// ============================================================================

describe("x402MCPServer", () => {
  let mockMcpServer: MockMcpServer;
  let mockResourceServer: MockResourceServer;
  let server: x402MCPServer;

  beforeEach(() => {
    mockMcpServer = createMockMcpServer();
    mockResourceServer = createMockResourceServer();
    server = new x402MCPServer(
      mockMcpServer as unknown as ConstructorParameters<typeof x402MCPServer>[0],
      mockResourceServer as unknown as ConstructorParameters<typeof x402MCPServer>[1],
    );
  });

  describe("constructor and accessors", () => {
    it("should expose underlying MCP server", () => {
      expect(server.server).toBe(mockMcpServer);
    });

    it("should expose underlying x402 resource server", () => {
      expect(server.x402Server).toBe(mockResourceServer);
    });
  });

  describe("initialize", () => {
    it("should initialize the resource server", async () => {
      await server.initialize();
      expect(mockResourceServer.initialize).toHaveBeenCalled();
    });
  });

  describe("tool (free tool passthrough)", () => {
    it("should register free tool with MCP server", () => {
      const handler = vi.fn();

      server.tool("ping", "Health check", {}, handler);

      expect(mockMcpServer.tool).toHaveBeenCalled();
    });

    it("should return this for chaining", () => {
      const result = server.tool("ping", "Health check", {}, vi.fn());
      expect(result).toBe(server);
    });
  });

  describe("resource (passthrough)", () => {
    it("should passthrough to MCP server", () => {
      server.resource("test-resource" as unknown as Parameters<typeof server.resource>[0]);
      expect(mockMcpServer.resource).toHaveBeenCalled();
    });

    it("should return this for chaining", () => {
      const result = server.resource("test" as unknown as Parameters<typeof server.resource>[0]);
      expect(result).toBe(server);
    });
  });

  describe("prompt (passthrough)", () => {
    it("should passthrough to MCP server", () => {
      server.prompt("test-prompt" as unknown as Parameters<typeof server.prompt>[0]);
      expect(mockMcpServer.prompt).toHaveBeenCalled();
    });

    it("should return this for chaining", () => {
      const result = server.prompt("test" as unknown as Parameters<typeof server.prompt>[0]);
      expect(result).toBe(server);
    });
  });

  describe("paidTool", () => {
    const paymentConfig = {
      scheme: "exact",
      network: "eip155:84532" as const,
      price: "$0.01",
      payTo: "0xrecipient",
    };

    it("should register tool with MCP server", () => {
      server.paidTool(
        "paid_tool",
        { description: "A paid tool", inputSchema: { arg: z.string() } },
        paymentConfig,
        vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
      );

      expect(mockMcpServer.tool).toHaveBeenCalled();
      const [name, description] = mockMcpServer.tool.mock.calls[0];
      expect(name).toBe("paid_tool");
      expect(description).toBe("A paid tool");
    });

    it("should return this for chaining", () => {
      const result = server.paidTool(
        "test",
        { description: "Test", inputSchema: {} },
        paymentConfig,
        vi.fn(),
      );
      expect(result).toBe(server);
    });

    describe("wrapped handler behavior", () => {
      let wrappedHandler: (
        args: Record<string, unknown>,
        extra: { _meta?: Record<string, unknown> },
      ) => Promise<{
        content: Array<{ type: "text"; text: string }>;
        isError?: boolean;
        _meta?: Record<string, unknown>;
      }>;

      beforeEach(() => {
        const realHandler = vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "success" }],
        });

        server.paidTool(
          "paid_tool",
          { description: "A paid tool", inputSchema: {} },
          paymentConfig,
          realHandler,
        );

        // Extract the wrapped handler from the mock call
        wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
      });

      it("should return 402 when no payment provided", async () => {
        const result = await wrappedHandler({}, { _meta: undefined });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('"x402/error"');
        expect(result.content[0].text).toContain(`"code":${MCP_PAYMENT_REQUIRED_CODE}`);
      });

      it("should include structuredContent in 402 response for interoperability", async () => {
        const result = await wrappedHandler({}, { _meta: undefined });

        expect(result.isError).toBe(true);
        // Should have structuredContent with direct PaymentRequired
        expect(result.structuredContent).toBeDefined();
        expect(result.structuredContent.x402Version).toBe(2);
        expect(result.structuredContent.accepts).toBeDefined();
        expect(Array.isArray(result.structuredContent.accepts)).toBe(true);
      });

      it("should include both structuredContent and content fallback", async () => {
        const result = await wrappedHandler({}, { _meta: undefined });

        // Both should be present
        expect(result.structuredContent).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);

        // structuredContent should be direct PaymentRequired
        expect(result.structuredContent.accepts).toBeDefined();

        // content should have x402/error wrapper
        const parsedContent = JSON.parse(result.content[0].text);
        expect(parsedContent["x402/error"]).toBeDefined();
        expect(parsedContent["x402/error"].code).toBe(MCP_PAYMENT_REQUIRED_CODE);
      });

      it("should verify and execute when payment provided", async () => {
        const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

        expect(mockResourceServer.verifyPayment).toHaveBeenCalledWith(
          mockPaymentPayload,
          expect.any(Object),
        );
        expect(result.content[0].text).toBe("success");
        expect(result._meta?.[MCP_PAYMENT_RESPONSE_META_KEY]).toEqual(mockSettleResponse);
      });

      it("should return 402 when payment verification fails", async () => {
        mockResourceServer.verifyPayment.mockResolvedValueOnce({
          isValid: false,
          invalidReason: "Insufficient balance",
        });

        const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Insufficient balance");
      });

      it("should settle payment after execution", async () => {
        await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

        expect(mockResourceServer.settlePayment).toHaveBeenCalledWith(
          mockPaymentPayload,
          expect.any(Object),
        );
      });

      it("should NOT settle payment when handler returns an error", async () => {
        // Register a tool that returns an error
        const errorHandler = vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Tool execution failed" }],
          isError: true,
        });

        server.paidTool(
          "error_tool",
          { description: "Tool that fails", inputSchema: {} },
          paymentConfig,
          errorHandler,
        );

        const errorWrappedHandler =
          mockMcpServer.tool.mock.calls[mockMcpServer.tool.mock.calls.length - 1][3];
        mockResourceServer.settlePayment.mockClear();

        const result = await errorWrappedHandler(
          {},
          { _meta: { "x402/payment": mockPaymentPayload } },
        );

        // Handler was called
        expect(errorHandler).toHaveBeenCalled();
        // Settlement was NOT called because handler returned an error
        expect(mockResourceServer.settlePayment).not.toHaveBeenCalled();
        // Result should be the error from the handler
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Tool execution failed");
      });

      it("should handle settlement failure gracefully", async () => {
        mockResourceServer.settlePayment.mockRejectedValueOnce(new Error("Settlement failed"));

        const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

        // Per MCP spec, settlement failure returns a 402 error (no content)
        expect(result.isError).toBe(true);
        const errorData = JSON.parse(result.content[0].text);
        expect(errorData["x402/error"].code).toBe(402);
        expect(errorData["x402/error"].message).toContain("Payment settlement failed");
        expect(errorData["x402/error"].data["x402/payment-response"]).toMatchObject({
          success: false,
          errorReason: "Settlement failed",
        });
      });
    });

    describe("dynamic pricing", () => {
      it("should resolve dynamic payTo", async () => {
        const dynamicPayTo = vi.fn().mockResolvedValue("0xdynamic");

        server.paidTool(
          "dynamic_tool",
          { description: "Dynamic pricing", inputSchema: {} },
          { ...paymentConfig, payTo: dynamicPayTo },
          vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
        );

        const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
        await wrappedHandler({}, { _meta: undefined });

        expect(dynamicPayTo).toHaveBeenCalledWith(
          expect.objectContaining({ toolName: "dynamic_tool" }),
        );
      });

      it("should resolve dynamic price", async () => {
        const dynamicPrice = vi.fn().mockResolvedValue("$0.05");

        server.paidTool(
          "dynamic_tool",
          { description: "Dynamic pricing", inputSchema: {} },
          { ...paymentConfig, price: dynamicPrice },
          vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
        );

        const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
        await wrappedHandler({}, { _meta: undefined });

        expect(dynamicPrice).toHaveBeenCalled();
      });
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createx402MCPServer", () => {
  it("should create server with basic config", () => {
    const server = createx402MCPServer({
      name: "test-server",
      version: "1.0.0",
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should create server with facilitator URL", () => {
    const server = createx402MCPServer({
      name: "test-server",
      version: "1.0.0",
      facilitator: "https://facilitator.x402.org",
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should create server with multiple facilitator URLs", () => {
    const server = createx402MCPServer({
      name: "test-server",
      version: "1.0.0",
      facilitator: ["https://f1.x402.org", "https://f2.x402.org"],
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should create server with scheme registrations", () => {
    const mockSchemeServer = {
      parsePrice: vi.fn(),
      buildPaymentRequirements: vi.fn(),
    };

    const server = createx402MCPServer({
      name: "test-server",
      version: "1.0.0",
      schemes: [
        {
          network: "eip155:84532",
          server: mockSchemeServer as unknown as Parameters<
            typeof createx402MCPServer
          >[0]["schemes"][0]["server"],
        },
      ],
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should defer initialization when syncFacilitatorOnStart is false", () => {
    const server = createx402MCPServer({
      name: "test-server",
      version: "1.0.0",
      syncFacilitatorOnStart: false,
    });

    expect(server).toBeInstanceOf(x402MCPServer);
    // Server is created but not initialized
  });
});

// ============================================================================
// Server Hooks Tests
// ============================================================================

describe("x402MCPServer hooks", () => {
  let mockMcpServer: MockMcpServer;
  let mockResourceServer: MockResourceServer;
  let server: x402MCPServer;

  const paymentConfig = {
    scheme: "exact",
    network: "eip155:84532" as const,
    price: "$0.01",
    payTo: "0xrecipient",
  };

  beforeEach(() => {
    mockMcpServer = {
      tool: vi.fn(),
      resource: vi.fn(),
      prompt: vi.fn(),
    };

    mockResourceServer = {
      initialize: vi.fn().mockResolvedValue(undefined),
      register: vi.fn(),
      verifyPayment: vi.fn().mockResolvedValue(mockVerifyResponse),
      settlePayment: vi.fn().mockResolvedValue(mockSettleResponse),
      buildPaymentRequirements: vi.fn().mockResolvedValue([mockPaymentRequirements]),
      createPaymentRequiredResponse: vi.fn().mockResolvedValue(mockPaymentRequired),
    };

    server = new x402MCPServer(
      mockMcpServer as unknown as ConstructorParameters<typeof x402MCPServer>[0],
      mockResourceServer as unknown as ConstructorParameters<typeof x402MCPServer>[1],
    );
  });

  describe("onBeforeExecution", () => {
    it("should call hook before tool execution", async () => {
      const hook = vi.fn();
      server.onBeforeExecution(hook);

      server.paidTool(
        "hook_test",
        { description: "Test", inputSchema: {} },
        paymentConfig,
        vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
      );

      const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
      await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "hook_test",
          paymentPayload: mockPaymentPayload,
        }),
      );
    });

    it("should abort execution when hook returns false", async () => {
      const hook = vi.fn().mockReturnValue(false);
      server.onBeforeExecution(hook);

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      server.paidTool(
        "hook_test",
        { description: "Test", inputSchema: {} },
        paymentConfig,
        handler,
      );

      const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
      const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(handler).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
    });
  });

  describe("onAfterExecution", () => {
    it("should call hook after tool execution", async () => {
      const hook = vi.fn();
      server.onAfterExecution(hook);

      server.paidTool(
        "hook_test",
        { description: "Test", inputSchema: {} },
        paymentConfig,
        vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
      );

      const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
      await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "hook_test",
          result: { content: [{ type: "text", text: "result" }] },
        }),
      );
    });
  });

  describe("onAfterSettlement", () => {
    it("should call hook after successful settlement", async () => {
      const hook = vi.fn();
      server.onAfterSettlement(hook);

      server.paidTool(
        "hook_test",
        { description: "Test", inputSchema: {} },
        paymentConfig,
        vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
      );

      const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
      await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "hook_test",
          settlement: mockSettleResponse,
        }),
      );
    });

    it("should not call hook when settlement fails", async () => {
      mockResourceServer.settlePayment.mockRejectedValueOnce(new Error("Settlement failed"));
      const hook = vi.fn();
      server.onAfterSettlement(hook);

      server.paidTool(
        "hook_test",
        { description: "Test", inputSchema: {} },
        paymentConfig,
        vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] }),
      );

      const wrappedHandler = mockMcpServer.tool.mock.calls[0][3];
      await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(hook).not.toHaveBeenCalled();
    });
  });

  describe("hook chaining", () => {
    it("should return this for method chaining", () => {
      const result = server
        .onBeforeExecution(vi.fn())
        .onAfterExecution(vi.fn())
        .onAfterSettlement(vi.fn());

      expect(result).toBe(server);
    });
  });
});

// ============================================================================
// createPaymentWrapper Tests (Low-Level API)
// ============================================================================

describe("createPaymentWrapper", () => {
  let mockResourceServer: MockResourceServer;

  beforeEach(() => {
    mockResourceServer = createMockResourceServer();
  });

  describe("with base config (no price)", () => {
    it("should create a wrapper function that takes price and handler", () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      expect(typeof paid).toBe("function");
    });

    it("should create wrapped handler when called with price and handler", () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid("$0.10", handler);

      expect(typeof wrappedHandler).toBe("function");
    });

    it("should return 402 when no payment provided", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid("$0.10", handler);

      const result = await wrappedHandler({}, { _meta: undefined });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('"x402/error"');
      expect(result.content[0].text).toContain(`"code":${MCP_PAYMENT_REQUIRED_CODE}`);
      expect(handler).not.toHaveBeenCalled();
    });

    it("should include structuredContent in 402 response", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid("$0.10", handler);

      const result = await wrappedHandler({}, { _meta: undefined });

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent.x402Version).toBe(2);
      expect(result.structuredContent.accepts).toBeDefined();
    });

    it("should verify payment and execute handler when payment provided", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "success" }] });
      const wrappedHandler = paid("$0.10", handler);

      const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(mockResourceServer.verifyPayment).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
      expect(result.content[0].text).toBe("success");
      expect(result._meta?.[MCP_PAYMENT_RESPONSE_META_KEY]).toEqual(mockSettleResponse);
    });

    it("should return 402 when payment verification fails", async () => {
      mockResourceServer.verifyPayment.mockResolvedValueOnce({
        isValid: false,
        invalidReason: "Insufficient balance",
      });

      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn();
      const wrappedHandler = paid("$0.10", handler);

      const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Insufficient balance");
      expect(handler).not.toHaveBeenCalled();
    });

    it("should NOT settle payment when handler returns an error", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const errorHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool execution failed" }],
        isError: true,
      });
      const wrappedHandler = paid("$0.10", errorHandler);
      mockResourceServer.settlePayment.mockClear();

      const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      // Handler was called
      expect(errorHandler).toHaveBeenCalled();
      // Settlement was NOT called because handler returned an error
      expect(mockResourceServer.settlePayment).not.toHaveBeenCalled();
      // Result should be the error from the handler
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Tool execution failed");
    });

    it("should handle settlement failure gracefully", async () => {
      mockResourceServer.settlePayment.mockRejectedValueOnce(new Error("Settlement failed"));

      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "success" }] });
      const wrappedHandler = paid("$0.10", handler);

      const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      // Per MCP spec, settlement failure returns a 402 error (no content)
      expect(result.isError).toBe(true);
      const errorData = JSON.parse(result.content[0].text);
      expect(errorData["x402/error"].code).toBe(402);
      expect(errorData["x402/error"].message).toContain("Payment settlement failed");
      expect(errorData["x402/error"].data["x402/payment-response"]).toMatchObject({
        success: false,
        errorReason: "Settlement failed",
      });
    });
  });

  describe("with full config (includes price)", () => {
    it("should create a wrapper function that takes only handler", () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
          price: "$0.10",
        },
      );

      expect(typeof paid).toBe("function");
    });

    it("should create wrapped handler when called with handler only", () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
          price: "$0.10",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid(handler);

      expect(typeof wrappedHandler).toBe("function");
    });

    it("should work correctly with full config", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
          price: "$0.10",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "success" }] });
      const wrappedHandler = paid(handler);

      const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

      expect(handler).toHaveBeenCalled();
      expect(result.content[0].text).toBe("success");
    });
  });

  describe("with extra config options", () => {
    it("should include extra in payment requirements", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
          price: "$0.10",
          extra: { name: "USDC", version: "2" },
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid(handler);

      await wrappedHandler({}, { _meta: undefined });

      // The buildPaymentRequirements should have been called
      expect(mockResourceServer.buildPaymentRequirements).toHaveBeenCalled();
    });

    it("should use resource config when provided", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
          price: "$0.10",
          resource: {
            url: "mcp://tool/custom_tool",
            description: "Custom description",
            mimeType: "text/plain",
          },
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid(handler);

      await wrappedHandler({}, { _meta: undefined });

      expect(mockResourceServer.createPaymentRequiredResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          description: "Custom description",
          mimeType: "text/plain",
        }),
        expect.any(String),
      );
    });
  });

  describe("dynamic config resolution", () => {
    it("should resolve dynamic payTo", async () => {
      const dynamicPayTo = vi.fn().mockResolvedValue("0xdynamic");

      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: dynamicPayTo,
          price: "$0.10",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid(handler);

      await wrappedHandler({ arg: "value" }, { _meta: undefined });

      expect(dynamicPayTo).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: { arg: "value" },
        }),
      );
    });

    it("should resolve dynamic price", async () => {
      const dynamicPrice = vi.fn().mockResolvedValue("$0.05");

      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid(dynamicPrice, handler);

      await wrappedHandler({}, { _meta: undefined });

      expect(dynamicPrice).toHaveBeenCalled();
    });
  });

  describe("handler context", () => {
    it("should pass correct context to handler", async () => {
      const paid = createPaymentWrapper(
        mockResourceServer as unknown as Parameters<typeof createPaymentWrapper>[0],
        {
          scheme: "exact",
          network: "eip155:84532",
          payTo: "0xrecipient",
          price: "$0.10",
        },
      );

      const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "result" }] });
      const wrappedHandler = paid(handler);

      const meta = { "x402/payment": mockPaymentPayload, custom: "data" };
      await wrappedHandler({ arg1: "value1" }, { _meta: meta });

      expect(handler).toHaveBeenCalledWith(
        { arg1: "value1" },
        expect.objectContaining({
          arguments: { arg1: "value1" },
          meta: meta,
        }),
      );
    });
  });
});
