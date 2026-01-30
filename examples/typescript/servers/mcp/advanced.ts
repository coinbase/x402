/**
 * MCP Server with x402 Paid Tools - Advanced Example
 *
 * This example demonstrates the LOW-LEVEL API using `x402MCPServer` directly.
 * Use this approach when you need:
 * - Custom resource server configuration
 * - Multiple facilitators
 * - Custom hooks and middleware
 * - Full control over initialization
 *
 * Run with: pnpm dev:advanced
 */

import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { x402MCPServer } from "@x402/mcp";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import express from "express";
import { z } from "zod";

config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
if (!evmAddress) {
  console.error("❌ EVM_ADDRESS environment variable is required");
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

const port = parseInt(process.env.PORT || "4022", 10);

/**
 * Simulates fetching weather data for a city.
 *
 * @param city - The city name to get weather for
 * @returns Weather data object
 */
function getWeatherData(city: string): { city: string; weather: string; temperature: number } {
  const conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
  const weather = conditions[Math.floor(Math.random() * conditions.length)];
  const temperature = Math.floor(Math.random() * 40) + 40;
  return { city, weather, temperature };
}

/**
 * Main entry point - Advanced API with manual setup and hooks.
 *
 * @returns Promise that resolves when server is running
 */
export async function main(): Promise<void> {
  console.log("\n📦 Using ADVANCED API (x402MCPServer with manual setup)\n");

  // ========================================================================
  // ADVANCED: Manual setup with full control
  // ========================================================================

  // Step 1: Create the MCP server manually
  const mcpServer = new McpServer({
    name: "x402 Weather Service (Advanced)",
    version: "1.0.0",
  });

  // Step 2: Create facilitator client(s) manually
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

  // Step 3: Create x402 resource server with custom configuration
  const resourceServer = new x402ResourceServer(facilitatorClient);

  // Step 4: Register payment schemes
  resourceServer.register("eip155:84532", new ExactEvmScheme());

  // Step 5: Initialize resource server
  await resourceServer.initialize();

  // Step 6: Create x402MCPServer by composing the servers
  const x402Server = new x402MCPServer(mcpServer, resourceServer);

  // ========================================================================
  // ADVANCED: Register hooks for observability and control
  // ========================================================================

  // Hook: Log before tool execution
  x402Server.onBeforeExecution(async context => {
    console.log(`\n🔧 [Hook] Before execution: ${context.toolName}`);
    console.log(`   Payment from: ${context.paymentPayload.payload.authorization.from}`);
    console.log(`   Amount: ${context.paymentRequirements.amount}`);
    // Return false to abort execution
    return true;
  });

  // Hook: Log after tool execution
  x402Server.onAfterExecution(async context => {
    console.log(`✅ [Hook] After execution: ${context.toolName}`);
    console.log(`   Result error: ${context.result.isError ?? false}`);
  });

  // Hook: Log after settlement
  x402Server.onAfterSettlement(async context => {
    console.log(`💸 [Hook] Settlement complete: ${context.toolName}`);
    console.log(`   Transaction: ${context.settlement.transaction}`);
    console.log(`   Success: ${context.settlement.success}\n`);
  });

  // ========================================================================
  // Register tools
  // ========================================================================

  x402Server.paidTool(
    "get_weather",
    {
      description: "Get current weather for a city. Requires payment of $0.001.",
      inputSchema: {
        city: z.string().describe("The city name to get weather for"),
      },
    },
    {
      scheme: "exact",
      network: "eip155:84532",
      price: "$0.001",
      payTo: evmAddress,
      extra: { name: "USDC", version: "2" },
    },
    async ({ city }) => ({
      content: [{ type: "text" as const, text: JSON.stringify(getWeatherData(city as string), null, 2) }],
    }),
  );

  x402Server.tool("ping", "A free tool that returns pong", {}, async () => ({
    content: [{ type: "text", text: "pong" }],
  }));

  // Start Express server
  startExpressServer(mcpServer, port);
}

/**
 * Helper to start Express SSE server
 *
 * @param mcpServer - The MCP server instance
 * @param port - Port to listen on
 */
function startExpressServer(mcpServer: McpServer, port: number): void {
  const app = express();
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    console.log("📡 New SSE connection");
    const transport = new SSEServerTransport("/messages", res);
    const sessionId = crypto.randomUUID();
    transports.set(sessionId, transport);
    res.on("close", () => {
      console.log("📡 SSE connection closed");
      transports.delete(sessionId);
    });
    await mcpServer.connect(transport);
  });

  app.post("/messages", express.json(), async (req, res) => {
    const transport = Array.from(transports.values())[0];
    if (!transport) {
      res.status(400).json({ error: "No active SSE connection" });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  app.get("/health", (_, res) => {
    res.json({ status: "ok", mode: "advanced", tools: ["get_weather (paid)", "ping (free)"] });
  });

  app.listen(port, () => {
    console.log(`🚀 x402 MCP Server (Advanced) running on http://localhost:${port}`);
    console.log(`\n📋 Available tools:`);
    console.log(`   - get_weather (paid: $0.001)`);
    console.log(`   - ping (free)`);
    console.log(`\n🔗 Connect via SSE: http://localhost:${port}/sse`);
    console.log(`📊 Hooks enabled: onBeforeExecution, onAfterExecution, onAfterSettlement\n`);
  });
}
