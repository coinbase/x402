/**
 * Need:
 * - MCP server to be able to verify token (SSE should be able to do this)
 * - Need client to be able to send header
 * - Each client application would need to implement a wallet type
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex } from "viem";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { withPaymentInterceptor } from "x402/axios";

const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(process.env.PRIVATE_KEY as Hex),
}).extend(publicActions);

async function getPrice(symbol: string): Promise<number> {
  let client = axios.create({});
  client = withPaymentInterceptor(client, wallet);

  const res = await client.post("https://x402.org/examples/price", { symbol });
  return res.data.price as number;
}

// Create an MCP server
const server = new McpServer({
  name: "x402 Bitcoin pricing API",
  version: "1.0.0",
});

// Add an addition tool
server.tool("get-price", { symbol: z.string() }, async ({ symbol }) => {
  const price = await getPrice(symbol);
  return {
    content: [{ type: "text", text: price.toString() }],
  };
});

// Add a dynamic greeting resource
server.resource(
  "available-symbols",
  new ResourceTemplate("available-symbols://", { list: undefined }),
  async uri => ({
    contents: [
      {
        uri: uri.href,
        text: `BTC, ETH, SOL`,
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
