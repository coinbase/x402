/**
 * MCP Server with x402 Paid Tools
 *
 * This example demonstrates how to create an MCP server with paid tools
 * using the x402 protocol. Clients calling these tools must pay before
 * the tool executes.
 *
 * Run with: pnpm dev
 * Connect via: MCP client or mcp-inspector
 */

import { config } from "dotenv";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createX402MCPServer } from "@x402/mcp";
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
  // Simulated weather data
  const conditions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
  const weather = conditions[Math.floor(Math.random() * conditions.length)];
  const temperature = Math.floor(Math.random() * 40) + 40; // 40-80°F

  return { city, weather, temperature };
}

/**
 * Main entry point - creates and starts the MCP server with paid tools.
 *
 * @returns Promise that resolves when server is running
 */
async function main(): Promise<void> {
  // Create x402 MCP server using the factory function (simplified setup)
  const x402Server = createX402MCPServer({
    name: "x402 Weather Service",
    version: "1.0.0",
    facilitator: facilitatorUrl,
    schemes: [{ network: "eip155:84532", server: new ExactEvmScheme() }],
  });

  // Initialize (fetches facilitator support)
  await x402Server.initialize();

  // Register a paid weather tool
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
      extra: {
        // EIP-712 domain parameters for USDC on Base Sepolia
        name: "USDC",
        version: "2",
      },
      resource: {
        description: "Weather data for the requested city",
        mimeType: "application/json",
      },
    },
    async ({ city }) => {
      const data = getWeatherData(city as string);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  // Register a free tool - all tools through x402Server for consistent API
  x402Server.tool("ping", "A free tool that returns pong", {}, async () => {
    return {
      content: [{ type: "text", text: "pong" }],
    };
  });

  // Get the underlying McpServer for transport connection
  const mcpServer = x402Server.server;

  // Create Express app for SSE transport
  const app = express();

  // Store active transports
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint for MCP connections
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

  // Messages endpoint for client-to-server messages
  app.post("/messages", express.json(), async (req, res) => {
    // Find the transport for this session (simplified - in production use session IDs)
    const transport = Array.from(transports.values())[0];
    if (!transport) {
      res.status(400).json({ error: "No active SSE connection" });
      return;
    }

    // Handle the incoming message
    await transport.handlePostMessage(req, res, req.body);
  });

  // Health check
  app.get("/health", (_, res) => {
    res.json({ status: "ok", tools: ["get_weather (paid)", "ping (free)"] });
  });

  app.listen(port, () => {
    console.log(`\n🚀 x402 MCP Server running on http://localhost:${port}`);
    console.log(`\n📋 Available tools:`);
    console.log(`   - get_weather (paid: $0.001)`);
    console.log(`   - ping (free)`);
    console.log(`\n🔗 Connect via SSE: http://localhost:${port}/sse`);
    console.log(`📬 Send messages to: http://localhost:${port}/messages`);
    console.log(`💚 Health check: http://localhost:${port}/health\n`);
  });
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
