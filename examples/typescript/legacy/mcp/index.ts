/**
 * Need:
 * - MCP server to be able to verify token (SSE should be able to do this)
 * - Need client to be able to send header
 * - Each client application would need to implement a wallet type
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { config } from "dotenv";
import { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withPaymentInterceptor } from "x402-axios";

config();

const privateKey = process.env.PRIVATE_KEY as Hex;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!privateKey || !baseURL || !endpointPath) {
  throw new Error("Missing environment variables");
}

const account = privateKeyToAccount(privateKey);

const client = withPaymentInterceptor(axios.create({ baseURL }), account);

// Create an MCP server
const server = new McpServer({
  name: "x402 MCP Client Demo",
  version: "1.0.0",
});

// Add an addition tool
server.tool(
  "get-data-from-resource-server",
  "Get data from the resource server (in this example, the weather)",
  {},
  async () => {
    const res = await client.get(endpointPath);
    return {
      content: [{ type: "text", text: JSON.stringify(res.data) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
