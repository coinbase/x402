/**
 * Unit tests for x402MCPServer
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { x402MCPServer, createX402MCPServer } from "../../src/server";
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
  maxAmountRequired: "1000",
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

      it("should handle settlement failure gracefully", async () => {
        mockResourceServer.settlePayment.mockRejectedValueOnce(new Error("Settlement failed"));

        const result = await wrappedHandler({}, { _meta: { "x402/payment": mockPaymentPayload } });

        // Should still return content but with error in _meta
        expect(result.content[0].text).toBe("success");
        expect(result._meta?.[MCP_PAYMENT_RESPONSE_META_KEY]).toMatchObject({
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

describe("createX402MCPServer", () => {
  it("should create server with basic config", () => {
    const server = createX402MCPServer({
      name: "test-server",
      version: "1.0.0",
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should create server with facilitator URL", () => {
    const server = createX402MCPServer({
      name: "test-server",
      version: "1.0.0",
      facilitator: "https://facilitator.x402.org",
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should create server with multiple facilitator URLs", () => {
    const server = createX402MCPServer({
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

    const server = createX402MCPServer({
      name: "test-server",
      version: "1.0.0",
      schemes: [
        {
          network: "eip155:84532",
          server: mockSchemeServer as unknown as Parameters<
            typeof createX402MCPServer
          >[0]["schemes"][0]["server"],
        },
      ],
    });

    expect(server).toBeInstanceOf(x402MCPServer);
  });

  it("should defer initialization when syncFacilitatorOnStart is false", () => {
    const server = createX402MCPServer({
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
