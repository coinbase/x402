/**
 * Need:
 * - MCP server to be able to verify token (SSE should be able to do this)
 * - Need client to be able to send header
 * - Each client application would need to implement a wallet type
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { createWalletClient, Hex, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { withPaymentInterceptor } from "x402-axios";
import { config } from "dotenv";

config();

const { RESOURCE_SERVER_URL, PRIVATE_KEY, ENDPOINT_PATH } = process.env;

if (!PRIVATE_KEY || !RESOURCE_SERVER_URL || !ENDPOINT_PATH) {
  throw new Error("Missing environment variables");
}

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(PRIVATE_KEY as Hex),
}).extend(publicActions);

const client = withPaymentInterceptor(axios.create({ baseURL: RESOURCE_SERVER_URL }), wallet);

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
    const res = await client.get(`${ENDPOINT_PATH}`);
    return {
      content: [{ type: "text", text: JSON.stringify(res.data) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
