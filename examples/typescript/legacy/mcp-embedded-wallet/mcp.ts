import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { focusApp, operations } from "./electron";
import { logger } from "./logger";
import { useFacilitator } from "x402/verify";
import { ipcMain } from "electron";

// Create an MCP server
const server = new McpServer({
  name: "x402-mcp",
  version: "1.0.0",
});

// Input schema for the x402 request tool
const x402RequestSchema = z.object({
  baseURL: z.string().url(),
  path: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  queryParams: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  correlationId: z
    .string()
    .optional()
    .describe("Optional correlation ID to group related x402 operations together"),
  maxAmountPerRequest: z.number().optional().describe("Optional max amount per request"),
  paymentRequirements: z
    .array(z.any())
    .optional()
    .describe(
      "Optional payment requirements from discovery endpoint - when provided, skips initial 402 discovery",
    ),
});

// Input schema for the sign message tool
const signMessageSchema = z.object({
  message: z.string().describe("The message to sign").default("hello"),
});

// Register tools
server.registerTool(
  "make_http_request_with_x402",
  {
    title: operations.makeX402Request.title,
    description: operations.makeX402Request.description,
    inputSchema: x402RequestSchema.shape,
  },
  async params => {
    logger.info("make_http_request_with_x402 tool called", params);
    try {
      const response = await operations.makeX402Request.tool(params);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("x402 request failed", error);
      throw error;
    }
  },
);

server.registerTool(
  "discovery_list",
  {
    title: operations.discoveryList.title,
    description: operations.discoveryList.description,
  },
  async () => {
    logger.info("discovery_list tool called");
    const items = await operations.discoveryList.tool();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(items, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "sign_message",
  {
    title: operations.signMessage.title,
    description: operations.signMessage.description,
    inputSchema: signMessageSchema.shape,
  },
  async params => {
    logger.info("sign_message tool called", params);
    const validatedParams = signMessageSchema.parse(params || {});
    const { message } = validatedParams;
    return {
      content: [{ type: "text", text: await operations.signMessage.tool(message) }],
    };
  },
);

server.registerTool(
  "get_wallet_address",
  {
    title: "Get Wallet Address",
    description: "Get the wallet address",
  },
  async params => {
    logger.info("get_wallet_address tool called", params);
    try {
      const address = await operations.getWalletAddress.tool();
      return {
        content: [{ type: "text", text: address }],
      };
    } catch (error) {
      logger.error("get_wallet_address failed", error);
      throw error;
    }
  },
);

server.registerTool(
  "show_wallet_app",
  {
    title: "Show Wallet App",
    description: "Shows the user the wallet interface",
  },
  async () => {
    logger.info("show_wallet_app tool called");
    focusApp();
    return { content: [{ type: "text", text: "Wallet app launched" }] };
  },
);

// Add discovery list handler
ipcMain.handle("get-discovery-list", async () => {
  try {
    const facilitator = {
      url: "https://x402.org/facilitator" as `${string}://${string}`, // <--- Use a facilitator with discovery support here
    };
    const { list } = useFacilitator(facilitator);
    return await list();
  } catch (error) {
    console.error("Failed to fetch discovery list:", error);
    throw error;
  }
});

/**
 * Launches the Model Context Protocol (MCP) server with configured tools and handlers.
 * Sets up stdin/stdout transport, error handling, and keeps the process alive until terminated.
 *
 * @returns {Promise<void>} Resolves when the server is shut down gracefully
 */
export async function launchMcp() {
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();

  try {
    logger.info("Initializing server...");
    await server.connect(transport);
    logger.info("Server started and connected successfully");

    // Set up error handling
    process.on("uncaughtException", error => {
      logger.error("Uncaught exception:", error);
      process.exit(1);
    });

    // Keep the process alive until explicitly terminated
    await new Promise(resolve => {
      process.on("SIGTERM", () => resolve(undefined));
      process.on("SIGINT", () => resolve(undefined));
    });
  } catch (error) {
    logger.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}
