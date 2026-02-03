import type { PaymentRequirements, Network, SchemeNetworkServer, Price } from "@x402/core/types";
import type { FacilitatorClient } from "@x402/core/server";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

import type {
  MCPToolContext,
  MCPToolPaymentConfig,
  BeforeExecutionHook,
  AfterExecutionHook,
  AfterSettlementHook,
  ServerHookContext,
  AfterExecutionContext,
  SettlementContext,
  DynamicPayTo,
  DynamicPrice,
} from "../types";
import { MCP_PAYMENT_REQUIRED_CODE, MCP_PAYMENT_RESPONSE_META_KEY } from "../types";
import { createToolResourceUrl, extractPaymentFromMeta } from "../utils";

/**
 * Configuration for tool input schema using Zod
 */
export interface ToolInputSchema {
  [key: string]: z.ZodType;
}

/**
 * Simplified type for McpServer.tool() registration.
 * The MCP SDK has complex overloaded signatures; this represents the 4-argument variant.
 */
type McpServerToolRegistration = (
  name: string,
  description: string,
  inputSchema: ToolInputSchema,
  handler: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult,
) => void;

/**
 * Tool definition configuration
 */
export interface ToolDefinition {
  /** Human-readable description of the tool */
  description: string;
  /** Input schema for the tool using Zod types */
  inputSchema: ToolInputSchema;
}

/**
 * Tool handler function type - returns MCP-compatible content
 */
export type ToolHandler<TArgs = Record<string, unknown>> = (
  args: TArgs,
  context: MCPToolContext,
) => Promise<ToolResult> | ToolResult;

/**
 * Tool result returned by handlers - includes index signature for MCP SDK compatibility.
 */
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Internal paid tool registration
 */
interface PaidToolRegistration {
  name: string;
  definition: ToolDefinition;
  paymentConfig: MCPToolPaymentConfig;
  handler: ToolHandler;
}

/**
 * x402-enabled MCP server that supports paid tool calls.
 *
 * Wraps an MCP server to add payment verification and settlement
 * functionality for tool calls. Tools registered with payment requirements
 * will return 402 errors when called without payment, and automatically
 * verify/settle payments when provided.
 *
 * @example
 * ```typescript
 * import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
 * import { x402MCPServer } from "@x402/mcp";
 * import { x402ResourceServer } from "@x402/core/server";
 *
 * const mcpServer = new McpServer({ name: "my-api", version: "1.0.0" });
 * const resourceServer = new x402ResourceServer(facilitatorClient);
 * resourceServer.register("eip155:84532", new ExactEvmServer());
 *
 * const x402Server = new x402MCPServer(mcpServer, resourceServer);
 *
 * x402Server.paidTool(
 *   "financial_analysis",
 *   {
 *     description: "Get financial analysis",
 *     inputSchema: { ticker: z.string() },
 *   },
 *   {
 *     scheme: "exact",
 *     network: "eip155:84532",
 *     price: "$0.10",
 *     payTo: "0x...",
 *   },
 *   async ({ ticker }) => {
 *     return { content: [{ type: "text", text: "Analysis..." }] };
 *   }
 * );
 * ```
 */
export class x402MCPServer {
  private readonly mcpServer: McpServer;
  private readonly resourceServer: x402ResourceServer;
  private readonly paidTools: Map<string, PaidToolRegistration> = new Map();
  private readonly beforeExecutionHooks: BeforeExecutionHook[] = [];
  private readonly afterExecutionHooks: AfterExecutionHook[] = [];
  private readonly afterSettlementHooks: AfterSettlementHook[] = [];

  /**
   * Creates a new x402MCPServer instance.
   *
   * @param mcpServer - The underlying MCP server instance
   * @param resourceServer - The x402 resource server for payment verification/settlement
   */
  constructor(mcpServer: McpServer, resourceServer: x402ResourceServer) {
    this.mcpServer = mcpServer;
    this.resourceServer = resourceServer;
  }

  /**
   * Get the underlying MCP server instance.
   * Use this for advanced MCP server functionality not exposed through x402MCPServer.
   *
   * @returns The MCP server instance
   */
  get server(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the underlying x402 resource server instance.
   *
   * @returns The x402 resource server instance
   */
  get x402Server(): x402ResourceServer {
    return this.resourceServer;
  }

  /**
   * Initialize the x402 MCP server.
   * This initializes the underlying resource server (fetching facilitator support).
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    await this.resourceServer.initialize();
  }

  /**
   * Register a hook to run before tool execution (after payment verification).
   * Return false from the hook to abort execution and return a 402 error.
   *
   * @param hook - Hook function
   * @returns This instance for chaining
   *
   * @example
   * ```typescript
   * server.onBeforeExecution(async ({ toolName, arguments: args }) => {
   *   // Custom validation before executing
   *   if (!isValidRequest(args)) {
   *     return false; // Aborts execution
   *   }
   * });
   * ```
   */
  onBeforeExecution(hook: BeforeExecutionHook): this {
    this.beforeExecutionHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to run after tool execution (before settlement).
   * Useful for logging, metrics, or modifying results.
   *
   * @param hook - Hook function
   * @returns This instance for chaining
   *
   * @example
   * ```typescript
   * server.onAfterExecution(async ({ toolName, result }) => {
   *   metrics.recordToolExecution(toolName, result.isError);
   * });
   * ```
   */
  onAfterExecution(hook: AfterExecutionHook): this {
    this.afterExecutionHooks.push(hook);
    return this;
  }

  /**
   * Register a hook to run after successful settlement.
   * Useful for logging, receipts, or analytics.
   *
   * @param hook - Hook function
   * @returns This instance for chaining
   *
   * @example
   * ```typescript
   * server.onAfterSettlement(async ({ toolName, settlement }) => {
   *   await saveReceipt(toolName, settlement.transaction);
   * });
   * ```
   */
  onAfterSettlement(hook: AfterSettlementHook): this {
    this.afterSettlementHooks.push(hook);
    return this;
  }

  /**
   * Registers a free tool with the MCP server.
   * This is a passthrough to the underlying McpServer.tool() method.
   *
   * Use this for tools that don't require payment. For paid tools,
   * use paidTool() instead.
   *
   * @param name - Unique identifier for the tool
   * @param description - Human-readable description of the tool
   * @param inputSchema - Input schema for the tool using Zod types
   * @param handler - Function that executes the tool logic
   * @returns This instance for chaining
   *
   * @example
   * ```typescript
   * x402Server.tool(
   *   "ping",
   *   "A free tool that returns pong",
   *   {},
   *   async () => ({ content: [{ type: "text", text: "pong" }] })
   * );
   * ```
   */
  tool(
    name: string,
    description: string,
    inputSchema: ToolInputSchema,
    handler: (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult,
  ): this {
    // MCP SDK has complex overloaded signatures that TypeScript can't infer.
    // We use the 4-argument variant: tool(name, description, schema, handler).
    // The cast through unknown is required because TypeScript's type narrowing
    // cannot determine which overload we're targeting from the method reference.
    // We use .bind() to preserve the McpServer instance's `this` context.
    const registerTool = this.mcpServer.tool.bind(
      this.mcpServer,
    ) as unknown as McpServerToolRegistration;
    registerTool(name, description, inputSchema, handler);

    return this;
  }

  /**
   * Registers a resource with the MCP server.
   * This is a passthrough to the underlying McpServer.resource() method.
   *
   * @param args - Arguments to pass to McpServer.resource()
   * @returns This instance for chaining
   */
  resource(...args: Parameters<McpServer["resource"]>): this {
    this.mcpServer.resource(...args);
    return this;
  }

  /**
   * Registers a prompt with the MCP server.
   * This is a passthrough to the underlying McpServer.prompt() method.
   *
   * @param args - Arguments to pass to McpServer.prompt()
   * @returns This instance for chaining
   */
  prompt(...args: Parameters<McpServer["prompt"]>): this {
    this.mcpServer.prompt(...args);
    return this;
  }

  /**
   * Registers a paid tool with the MCP server.
   *
   * The tool will require payment before execution. When called without payment,
   * a 402 error with PaymentRequired data will be returned. When called with
   * valid payment in _meta["x402/payment"], the payment will be verified,
   * the tool executed, and the payment settled.
   *
   * @param name - Unique identifier for the tool
   * @param definition - Tool definition including description and input schema
   * @param paymentConfig - Payment configuration for the tool
   * @param handler - Function that executes the tool logic
   * @returns This instance for chaining
   *
   * @example
   * ```typescript
   * x402Server.paidTool(
   *   "premium_search",
   *   {
   *     description: "Search with premium features",
   *     inputSchema: { query: z.string() },
   *   },
   *   {
   *     scheme: "exact",
   *     network: "eip155:84532",
   *     price: "$0.05",
   *     payTo: "0x...",
   *   },
   *   async ({ query }) => {
   *     const results = await search(query);
   *     return { content: [{ type: "text", text: JSON.stringify(results) }] };
   *   }
   * );
   * ```
   */
  paidTool<TArgs extends Record<string, unknown>>(
    name: string,
    definition: ToolDefinition,
    paymentConfig: MCPToolPaymentConfig,
    handler: ToolHandler<TArgs>,
  ): this {
    // Store the registration
    this.paidTools.set(name, {
      name,
      definition,
      paymentConfig,
      handler: handler as ToolHandler,
    });

    // Create the wrapped handler
    const wrappedHandler = async (
      args: Record<string, unknown>,
      extra: { _meta?: Record<string, unknown> },
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      isError?: boolean;
      _meta?: Record<string, unknown>;
    }> => {
      const context: MCPToolContext = {
        toolName: name,
        arguments: args,
        meta: extra?._meta,
      };

      // Extract payment from _meta if present
      const paymentPayload = extractPaymentFromMeta({
        name,
        arguments: args,
        _meta: extra?._meta,
      });

      // Build payment requirements using resource server (handles price parsing via registered schemes)
      const paymentRequirements = await this.buildPaymentRequirements(name, paymentConfig, context);

      // If no payment provided, return 402 error as structured result
      if (!paymentPayload) {
        return this.createPaymentRequiredResult(
          name,
          paymentConfig,
          paymentRequirements,
          "Payment required to access this tool",
        );
      }

      // Verify payment
      const verifyResult = await this.resourceServer.verifyPayment(
        paymentPayload,
        paymentRequirements,
      );

      if (!verifyResult.isValid) {
        return this.createPaymentRequiredResult(
          name,
          paymentConfig,
          paymentRequirements,
          verifyResult.invalidReason || "Payment verification failed",
        );
      }

      // Build hook context
      const hookContext: ServerHookContext = {
        toolName: name,
        arguments: args,
        paymentRequirements,
        paymentPayload,
      };

      // Run before execution hooks
      for (const hook of this.beforeExecutionHooks) {
        const result = await hook(hookContext);
        if (result === false) {
          return this.createPaymentRequiredResult(
            name,
            paymentConfig,
            paymentRequirements,
            "Execution blocked by hook",
          );
        }
      }

      // Execute the tool handler
      const result = await handler(args as TArgs, context);

      // Build after execution context
      const afterExecContext: AfterExecutionContext = {
        ...hookContext,
        result,
      };

      // Run after execution hooks
      for (const hook of this.afterExecutionHooks) {
        await hook(afterExecContext);
      }

      // If the tool handler returned an error, don't proceed to settlement
      // The user shouldn't be charged if the tool failed to execute
      if (result.isError) {
        return result;
      }

      // Settle the payment (match HTTP behavior: settle after execution)
      try {
        const settleResult = await this.resourceServer.settlePayment(
          paymentPayload,
          paymentRequirements,
        );

        // Run after settlement hooks
        const settlementContext: SettlementContext = {
          ...hookContext,
          settlement: settleResult,
        };
        for (const hook of this.afterSettlementHooks) {
          await hook(settlementContext);
        }

        // Return result with payment response in _meta
        return {
          content: result.content,
          isError: result.isError,
          _meta: {
            [MCP_PAYMENT_RESPONSE_META_KEY]: settleResult,
          },
        };
      } catch (settleError) {
        // Settlement failed after execution - return 402 error per MCP spec
        // Don't return content when settlement fails
        return this.createSettlementFailedResult(
          name,
          paymentConfig,
          paymentRequirements,
          settleError instanceof Error ? settleError.message : "Settlement failed",
        );
      }
    };

    // Register with MCP server using the server.tool() API
    // Signature: tool(name, description, inputSchema, callback)
    // We need to cast types due to MCP SDK's complex generic types
    // The inputSchema needs to be cast to ZodRawShape which is what the SDK expects
    (
      this.mcpServer.tool as (
        name: string,
        description: string,
        inputSchema: ToolInputSchema,
        cb: typeof wrappedHandler,
      ) => void
    )(name, definition.description, definition.inputSchema, wrappedHandler);

    return this;
  }

  /**
   * Creates a structured 402 payment required result.
   *
   * Note: The MCP SDK converts McpError exceptions to tool results with isError: true,
   * but loses the error.data field. We work around this by embedding the error structure
   * in the result content as JSON. This deviates from the x402 MCP transport spec
   * (which specifies error.data) due to MCP SDK limitations.
   *
   * @param name - Tool name
   * @param paymentConfig - Payment configuration
   * @param paymentRequirements - Resolved payment requirements
   * @param errorMessage - Error message
   * @returns Structured result with payment required data
   */
  private async createPaymentRequiredResult(
    name: string,
    paymentConfig: MCPToolPaymentConfig,
    paymentRequirements: PaymentRequirements,
    errorMessage: string,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError: boolean;
  }> {
    const resourceInfo = {
      url: createToolResourceUrl(name, paymentConfig.resource?.url),
      description: paymentConfig.resource?.description || `Tool: ${name}`,
      mimeType: paymentConfig.resource?.mimeType || "application/json",
    };

    const paymentRequired = await this.resourceServer.createPaymentRequiredResponse(
      [paymentRequirements],
      resourceInfo,
      errorMessage,
    );

    // Embed error in content as JSON (SDK limitation workaround)
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            "x402/error": {
              code: MCP_PAYMENT_REQUIRED_CODE,
              message: errorMessage,
              data: paymentRequired,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  /**
   * Creates a structured 402 settlement failed result.
   *
   * Per MCP transport spec, settlement failure returns a 402 error (not content with error in _meta).
   * The error data includes the original payment requirements plus settlement failure info.
   *
   * @param name - Tool name
   * @param paymentConfig - Payment configuration
   * @param paymentRequirements - Resolved payment requirements
   * @param errorMessage - Error message describing settlement failure
   * @returns Structured 402 error result
   */
  private async createSettlementFailedResult(
    name: string,
    paymentConfig: MCPToolPaymentConfig,
    paymentRequirements: PaymentRequirements,
    errorMessage: string,
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError: boolean;
  }> {
    const resourceInfo = {
      url: createToolResourceUrl(name, paymentConfig.resource?.url),
      description: paymentConfig.resource?.description || `Tool: ${name}`,
      mimeType: paymentConfig.resource?.mimeType || "application/json",
    };

    const paymentRequired = await this.resourceServer.createPaymentRequiredResponse(
      [paymentRequirements],
      resourceInfo,
      `Payment settlement failed: ${errorMessage}`,
    );

    // Include settlement failure response per MCP spec
    const settlementFailure = {
      success: false,
      errorReason: errorMessage,
      transaction: "",
      network: paymentRequirements.network,
    };

    // Embed error in content as JSON (SDK limitation workaround)
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            "x402/error": {
              code: MCP_PAYMENT_REQUIRED_CODE,
              message: `Payment settlement failed: ${errorMessage}`,
              data: {
                ...paymentRequired,
                [MCP_PAYMENT_RESPONSE_META_KEY]: settlementFailure,
              },
            },
          }),
        },
      ],
      isError: true,
    };
  }

  /**
   * Builds payment requirements from configuration, resolving dynamic values.
   * Delegates price parsing to the resource server which uses registered scheme servers.
   *
   * @param name - Tool name
   * @param config - Payment configuration
   * @param context - Tool call context
   * @returns Resolved payment requirements
   */
  private async buildPaymentRequirements(
    name: string,
    config: MCPToolPaymentConfig,
    context: MCPToolContext,
  ): Promise<PaymentRequirements> {
    // Resolve dynamic payTo
    const payTo = typeof config.payTo === "function" ? await config.payTo(context) : config.payTo;

    // Resolve dynamic price
    const price = typeof config.price === "function" ? await config.price(context) : config.price;

    // Use resource server to build requirements (handles price parsing via registered schemes)
    const requirements = await this.resourceServer.buildPaymentRequirements({
      scheme: config.scheme,
      payTo,
      price,
      network: config.network,
      maxTimeoutSeconds: config.maxTimeoutSeconds,
    });

    // buildPaymentRequirements returns an array, we expect exactly one
    if (requirements.length === 0) {
      throw new Error(`No payment requirements could be built for tool ${name}`);
    }

    const result = requirements[0];

    // Merge any extra config (e.g., EIP-712 domain params) into the requirements
    if (config.extra) {
      result.extra = { ...result.extra, ...config.extra };
    }

    return result;
  }
}

/**
 * Scheme registration configuration for the factory function
 */
export interface SchemeRegistration {
  /** The network identifier (e.g., 'eip155:84532', 'solana:mainnet') */
  network: Network;
  /** The scheme server implementation for this network */
  server: SchemeNetworkServer;
}

/**
 * Configuration options for createx402MCPServer factory
 */
export interface x402MCPServerConfig {
  /** MCP server name */
  name: string;

  /** MCP server version */
  version: string;

  /**
   * Facilitator URL(s) for payment processing.
   * Can be a single URL string, an array of URLs, or pre-configured FacilitatorClient(s).
   * Defaults to the public x402 facilitator if not specified.
   */
  facilitator?: string | string[] | FacilitatorClient | FacilitatorClient[];

  /**
   * Payment scheme registrations.
   * Each registration maps a network to its scheme server implementation.
   */
  schemes?: SchemeRegistration[];

  /**
   * Whether to automatically initialize the facilitator when the server is created.
   * When true (default), the server will immediately start fetching facilitator support.
   * When false, you must call server.initialize() manually before processing paid tools.
   *
   * Set to false for serverless environments where you want to defer initialization
   * until the first request.
   *
   * @default true
   */
  syncFacilitatorOnStart?: boolean;

  /**
   * Additional MCP server options passed to McpServer constructor
   */
  mcpServerOptions?: Record<string, unknown>;
}

/**
 * Creates a fully configured x402 MCP server with sensible defaults.
 *
 * This factory function provides the simplest way to create an x402-enabled MCP server.
 * It handles creation of the underlying McpServer and x402ResourceServer, making it
 * easy to get started with paid tools.
 *
 * @param config - Server configuration options
 * @returns A configured x402MCPServer instance
 *
 * @example
 * ```typescript
 * import { createx402MCPServer } from "@x402/mcp";
 * import { ExactEvmServer } from "@x402/evm/exact/server";
 *
 * const server = createx402MCPServer({
 *   name: "weather-api",
 *   version: "1.0.0",
 *   facilitator: "https://facilitator.x402.org/",
 *   schemes: [
 *     { network: "eip155:84532", server: new ExactEvmServer() },
 *   ],
 * });
 *
 * // Register a paid tool
 * server.paidTool(
 *   "get_weather",
 *   { description: "Get weather data", inputSchema: { city: z.string() } },
 *   { scheme: "exact", network: "eip155:84532", price: "$0.001", payTo: "0x..." },
 *   async ({ city }) => ({ content: [{ type: "text", text: "Weather data..." }] })
 * );
 *
 * // Register a free tool
 * server.tool(
 *   "ping",
 *   "A free health check tool",
 *   {},
 *   async () => ({ content: [{ type: "text", text: "pong" }] })
 * );
 *
 * // Connect to transport (e.g., SSE)
 * await server.server.connect(transport);
 * ```
 */
export function createx402MCPServer(config: x402MCPServerConfig): x402MCPServer {
  // Create the MCP server
  const mcpServer = new McpServer(
    {
      name: config.name,
      version: config.version,
    },
    config.mcpServerOptions,
  );

  // Create facilitator client(s)
  let facilitatorClients: FacilitatorClient | FacilitatorClient[] | undefined;

  if (config.facilitator) {
    if (typeof config.facilitator === "string") {
      // Single URL string - wrap in config object
      facilitatorClients = new HTTPFacilitatorClient({ url: config.facilitator });
    } else if (Array.isArray(config.facilitator)) {
      // Array of URLs or clients
      facilitatorClients = config.facilitator.map(f =>
        typeof f === "string" ? new HTTPFacilitatorClient({ url: f }) : f,
      );
    } else {
      // Pre-configured client
      facilitatorClients = config.facilitator;
    }
  }

  // Create the resource server
  const resourceServer = new x402ResourceServer(facilitatorClients);

  // Register schemes
  if (config.schemes) {
    for (const { network, server } of config.schemes) {
      resourceServer.register(network, server);
    }
  }

  // Create the x402MCPServer
  const x402Server = new x402MCPServer(mcpServer, resourceServer);

  // Initialize if syncFacilitatorOnStart is true (default)
  if (config.syncFacilitatorOnStart !== false) {
    // Start initialization in background (don't await)
    // The server will be ready when first paid tool is called
    x402Server.initialize().catch(err => {
      console.error("Failed to initialize x402 MCP server:", err);
    });
  }

  return x402Server;
}

// ============================================================================
// Low-Level API: Payment Wrapper for Existing MCP Servers
// ============================================================================

/**
 * Base configuration for payment wrapper (without price).
 * Use this when you want to specify different prices per tool.
 */
export interface PaymentWrapperBaseConfig {
  /** Payment scheme identifier (e.g., "exact") */
  scheme: string;

  /** Blockchain network identifier in CAIP-2 format (e.g., "eip155:84532") */
  network: Network;

  /** Recipient wallet address or dynamic resolver */
  payTo: string | DynamicPayTo;

  /** Maximum time allowed for payment completion in seconds */
  maxTimeoutSeconds?: number;

  /** Scheme-specific additional information */
  extra?: Record<string, unknown>;

  /** Resource metadata for the tool */
  resource?: {
    /** Custom URL for the resource (defaults to mcp://tool/{toolName}) */
    url?: string;
    /** Human-readable description of the tool */
    description?: string;
    /** MIME type of the tool response */
    mimeType?: string;
  };
}

/**
 * Full configuration for payment wrapper (includes price).
 * Use this for single-tool scenarios or when all tools have the same price.
 */
export interface PaymentWrapperFullConfig extends PaymentWrapperBaseConfig {
  /** Price for the tool call (e.g., "$0.10", "1000000") */
  price: Price | DynamicPrice;
}

/**
 * Result type for wrapped tool handlers.
 * Matches the MCP SDK's expected tool result format with optional _meta.
 * Includes index signature for MCP SDK compatibility with CallToolResult.
 */
export interface WrappedToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/**
 * Handler function type for tools to be wrapped with payment.
 */
export type PaymentWrappedHandler<TArgs = Record<string, unknown>> = (
  args: TArgs,
  context: MCPToolContext,
) => Promise<ToolResult> | ToolResult;

/**
 * MCP SDK compatible tool callback type.
 * This type matches the signature expected by McpServer.tool() for tools with arguments.
 * The return type is compatible with CallToolResult from the MCP SDK.
 *
 * Note: We use `unknown` for `extra` because the MCP SDK passes `RequestHandlerExtra` which
 * contains `_meta` and other fields. Using `unknown` allows TypeScript to accept it.
 */
export type MCPToolCallback<TArgs = Record<string, unknown>> = (
  args: TArgs,
  extra: unknown,
) => WrappedToolResult | Promise<WrappedToolResult>;

/**
 * The function returned by createPaymentWrapper when using base config (no price).
 * Call with price and handler to create a wrapped handler.
 * Returns an MCP SDK compatible callback that can be passed directly to McpServer.tool().
 */
export type PaymentWrapperWithPrice = <TArgs extends Record<string, unknown>>(
  price: Price | DynamicPrice,
  handler: PaymentWrappedHandler<TArgs>,
) => MCPToolCallback<TArgs>;

/**
 * The function returned by createPaymentWrapper when using full config (includes price).
 * Call with just the handler to create a wrapped handler.
 * Returns an MCP SDK compatible callback that can be passed directly to McpServer.tool().
 */
export type PaymentWrapperWithoutPrice = <TArgs extends Record<string, unknown>>(
  handler: PaymentWrappedHandler<TArgs>,
) => MCPToolCallback<TArgs>;

/**
 * Creates a reusable payment wrapper for adding x402 payment to MCP tool handlers.
 *
 * This is the LOW-LEVEL API for integrating x402 payments with existing MCP servers.
 * Use this when you have an existing McpServer and want to add payment to specific tools
 * without adopting the full x402MCPServer abstraction.
 *
 * @param resourceServer - The x402 resource server for payment verification/settlement
 * @param config - Payment configuration (with or without price)
 * @returns A function that wraps tool handlers with payment logic
 *
 * @example
 * ```typescript
 * // === Integrating with an EXISTING MCP server ===
 *
 * import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
 * import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
 * import { ExactEvmServer } from "@x402/evm/exact/server";
 *
 * // Your existing MCP server
 * const mcpServer = new McpServer({ name: "my-api", version: "1.0.0" });
 *
 * // Set up x402 resource server for payment handling
 * const resourceServer = new x402ResourceServer(facilitatorClient);
 * resourceServer.register("eip155:84532", new ExactEvmServer());
 * await resourceServer.initialize();
 *
 * // Create a payment wrapper with shared config
 * const paid = createPaymentWrapper(resourceServer, {
 *   scheme: "exact",
 *   network: "eip155:84532",
 *   payTo: "0x...",
 * });
 *
 * // Use native McpServer.tool() API - wrap handlers with payment
 * mcpServer.tool("search", "Premium search", { query: z.string() },
 *   paid("$0.10", async (args) => ({
 *     content: [{ type: "text", text: "Search results..." }]
 *   }))
 * );
 *
 * mcpServer.tool("analyze", "Data analysis", { data: z.string() },
 *   paid("$0.05", async (args) => ({
 *     content: [{ type: "text", text: "Analysis results..." }]
 *   }))
 * );
 *
 * // Free tools work exactly as before - no wrapper needed
 * mcpServer.tool("ping", "Health check", {},
 *   async () => ({ content: [{ type: "text", text: "pong" }] })
 * );
 * ```
 *
 * @example
 * ```typescript
 * // === Single tool with full config (includes price) ===
 *
 * const paid = createPaymentWrapper(resourceServer, {
 *   scheme: "exact",
 *   network: "eip155:84532",
 *   payTo: "0x...",
 *   price: "$0.10",  // Price included in config
 * });
 *
 * // Just pass the handler - price is already configured
 * mcpServer.tool("premium_tool", "desc", {},
 *   paid(async (args) => ({
 *     content: [{ type: "text", text: "Result" }]
 *   }))
 * );
 * ```
 */
export function createPaymentWrapper(
  resourceServer: x402ResourceServer,
  config: PaymentWrapperBaseConfig,
): PaymentWrapperWithPrice;
export function createPaymentWrapper(
  resourceServer: x402ResourceServer,
  config: PaymentWrapperFullConfig,
): PaymentWrapperWithoutPrice;
/**
 * Implementation of createPaymentWrapper that handles both base and full config variants.
 *
 * @param resourceServer - The x402 resource server for payment verification and settlement
 * @param config - Payment wrapper configuration (with or without price)
 * @returns A function that wraps tool handlers with payment logic
 */
export function createPaymentWrapper(
  resourceServer: x402ResourceServer,
  config: PaymentWrapperBaseConfig | PaymentWrapperFullConfig,
): PaymentWrapperWithPrice | PaymentWrapperWithoutPrice {
  const hasPrice = "price" in config && config.price !== undefined;

  // Internal function to create the actual wrapped handler
  const createWrappedHandler = <TArgs extends Record<string, unknown>>(
    price: Price | DynamicPrice,
    handler: PaymentWrappedHandler<TArgs>,
  ): ((args: TArgs, extra: { _meta?: Record<string, unknown> }) => Promise<WrappedToolResult>) => {
    return async (
      args: TArgs,
      extra: { _meta?: Record<string, unknown> },
    ): Promise<WrappedToolResult> => {
      // We need to derive toolName from somewhere - use a placeholder that gets resolved
      // The MCP SDK passes the tool name through, but we don't have direct access to it here
      // We'll use a generic name that can be customized via config.resource
      const toolName = config.resource?.url?.replace("mcp://tool/", "") || "paid_tool";

      const context: MCPToolContext = {
        toolName,
        arguments: args,
        meta: extra?._meta,
      };

      // Extract payment from _meta if present
      const paymentPayload = extractPaymentFromMeta({
        name: toolName,
        arguments: args,
        _meta: extra?._meta,
      });

      // Build payment requirements
      const paymentRequirements = await buildPaymentRequirementsFromConfig(
        resourceServer,
        toolName,
        { ...config, price },
        context,
      );

      // If no payment provided, return 402 error as structured result
      if (!paymentPayload) {
        return createPaymentRequiredResultFromConfig(
          resourceServer,
          toolName,
          { ...config, price },
          paymentRequirements,
          "Payment required to access this tool",
        );
      }

      // Verify payment
      const verifyResult = await resourceServer.verifyPayment(paymentPayload, paymentRequirements);

      if (!verifyResult.isValid) {
        return createPaymentRequiredResultFromConfig(
          resourceServer,
          toolName,
          { ...config, price },
          paymentRequirements,
          verifyResult.invalidReason || "Payment verification failed",
        );
      }

      // Execute the tool handler
      const result = await handler(args, context);

      // If the tool handler returned an error, don't proceed to settlement
      // The user shouldn't be charged if the tool failed to execute
      if (result.isError) {
        return result;
      }

      // Settle the payment
      try {
        const settleResult = await resourceServer.settlePayment(
          paymentPayload,
          paymentRequirements,
        );

        // Return result with payment response in _meta
        return {
          content: result.content,
          isError: result.isError,
          _meta: {
            [MCP_PAYMENT_RESPONSE_META_KEY]: settleResult,
          },
        };
      } catch (settleError) {
        // Settlement failed after execution - return 402 error per MCP spec
        // Don't return content when settlement fails
        return createSettlementFailedResultFromConfig(
          resourceServer,
          toolName,
          { ...config, price },
          paymentRequirements,
          settleError instanceof Error ? settleError.message : "Settlement failed",
        );
      }
    };
  };

  if (hasPrice) {
    // Full config with price - return function that just takes handler
    const fullConfig = config as PaymentWrapperFullConfig;
    return <TArgs extends Record<string, unknown>>(
      handler: PaymentWrappedHandler<TArgs>,
    ): MCPToolCallback<TArgs> => {
      // Cast to MCPToolCallback for MCP SDK compatibility
      return createWrappedHandler(fullConfig.price, handler) as MCPToolCallback<TArgs>;
    };
  } else {
    // Base config without price - return function that takes price and handler
    return <TArgs extends Record<string, unknown>>(
      price: Price | DynamicPrice,
      handler: PaymentWrappedHandler<TArgs>,
    ): MCPToolCallback<TArgs> => {
      // Cast to MCPToolCallback for MCP SDK compatibility
      return createWrappedHandler(price, handler) as MCPToolCallback<TArgs>;
    };
  }
}

/**
 * Helper to build payment requirements from wrapper config.
 *
 * @param resourceServer - The x402 resource server for building requirements
 * @param toolName - Name of the tool for error messages
 * @param config - Payment wrapper configuration including price
 * @param context - Tool call context for resolving dynamic values
 * @returns Resolved payment requirements for the tool
 */
async function buildPaymentRequirementsFromConfig(
  resourceServer: x402ResourceServer,
  toolName: string,
  config: PaymentWrapperFullConfig,
  context: MCPToolContext,
): Promise<PaymentRequirements> {
  // Resolve dynamic payTo
  const payTo = typeof config.payTo === "function" ? await config.payTo(context) : config.payTo;

  // Resolve dynamic price
  const price = typeof config.price === "function" ? await config.price(context) : config.price;

  // Use resource server to build requirements
  const requirements = await resourceServer.buildPaymentRequirements({
    scheme: config.scheme,
    payTo,
    price,
    network: config.network,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
  });

  if (requirements.length === 0) {
    throw new Error(`No payment requirements could be built for tool ${toolName}`);
  }

  const result = requirements[0];

  // Merge any extra config
  if (config.extra) {
    result.extra = { ...result.extra, ...config.extra };
  }

  return result;
}

/**
 * Helper to create 402 payment required result from wrapper config.
 *
 * @param resourceServer - The x402 resource server for creating payment required response
 * @param toolName - Name of the tool for resource URL
 * @param config - Payment wrapper configuration
 * @param paymentRequirements - Resolved payment requirements to include in response
 * @param errorMessage - Error message describing why payment is required
 * @returns Structured 402 error result with payment requirements
 */
async function createPaymentRequiredResultFromConfig(
  resourceServer: x402ResourceServer,
  toolName: string,
  config: PaymentWrapperFullConfig,
  paymentRequirements: PaymentRequirements,
  errorMessage: string,
): Promise<WrappedToolResult> {
  const resourceInfo = {
    url: createToolResourceUrl(toolName, config.resource?.url),
    description: config.resource?.description || `Tool: ${toolName}`,
    mimeType: config.resource?.mimeType || "application/json",
  };

  const paymentRequired = await resourceServer.createPaymentRequiredResponse(
    [paymentRequirements],
    resourceInfo,
    errorMessage,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          "x402/error": {
            code: MCP_PAYMENT_REQUIRED_CODE,
            message: errorMessage,
            data: paymentRequired,
          },
        }),
      },
    ],
    isError: true,
  };
}

/**
 * Helper to create 402 settlement failed result from wrapper config.
 * Per MCP transport spec, settlement failure returns a 402 error (not content with error in _meta).
 *
 * @param resourceServer - The x402 resource server for creating error response
 * @param toolName - Name of the tool for resource URL
 * @param config - Payment wrapper configuration
 * @param paymentRequirements - Original payment requirements for error response
 * @param errorMessage - Error message describing the settlement failure
 * @returns Structured 402 error result with settlement failure info
 */
async function createSettlementFailedResultFromConfig(
  resourceServer: x402ResourceServer,
  toolName: string,
  config: PaymentWrapperFullConfig,
  paymentRequirements: PaymentRequirements,
  errorMessage: string,
): Promise<WrappedToolResult> {
  const resourceInfo = {
    url: createToolResourceUrl(toolName, config.resource?.url),
    description: config.resource?.description || `Tool: ${toolName}`,
    mimeType: config.resource?.mimeType || "application/json",
  };

  const paymentRequired = await resourceServer.createPaymentRequiredResponse(
    [paymentRequirements],
    resourceInfo,
    `Payment settlement failed: ${errorMessage}`,
  );

  // Include settlement failure response per MCP spec
  const settlementFailure = {
    success: false,
    errorReason: errorMessage,
    transaction: "",
    network: paymentRequirements.network,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          "x402/error": {
            code: MCP_PAYMENT_REQUIRED_CODE,
            message: `Payment settlement failed: ${errorMessage}`,
            data: {
              ...paymentRequired,
              [MCP_PAYMENT_RESPONSE_META_KEY]: settlementFailure,
            },
          },
        }),
      },
    ],
    isError: true,
  };
}
