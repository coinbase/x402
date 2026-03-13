/**
 * MCP Server with x402 Payment Integration
 *
 * This example demonstrates how to create an MCP server that can make
 * paid API requests using the x402 protocol with EVM, SVM, and AVM support.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { config } from "dotenv";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { toClientAvmSigner } from "@x402/avm";
import { registerExactAvmScheme } from "@x402/avm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

config();

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const avmPrivateKey = process.env.AVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";

if (!evmPrivateKey || !svmPrivateKey || !avmPrivateKey) {
  throw new Error("EVM_PRIVATE_KEY, SVM_PRIVATE_KEY, and AVM_PRIVATE_KEY must all be provided");
}

/**
 * Creates an axios client configured with x402 payment support for EVM, SVM, and AVM.
 *
 * @returns A wrapped axios instance that handles 402 payment flows automatically.
 */
async function createClient() {
  const client = new x402Client();

  const evmSigner = privateKeyToAccount(evmPrivateKey);
  registerExactEvmScheme(client, { signer: evmSigner });

  const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));
  registerExactSvmScheme(client, { signer: svmSigner });

  const avmSigner = toClientAvmSigner(avmPrivateKey);
  registerExactAvmScheme(client, { signer: avmSigner });

  return wrapAxiosWithPayment(axios.create({ baseURL }), client);
}

/**
 * Initializes and starts the MCP server with x402 payment-enabled tools.
 */
async function main() {
  const api = await createClient();

  // Create an MCP server
  const server = new McpServer({
    name: "x402 MCP Client Demo",
    version: "2.0.0",
  });

  // Add a tool to get data from the resource server
  server.tool(
    "get-data-from-resource-server",
    "Get data from the resource server",
    {},
    async () => {
      const res = await api.get(endpointPath);
      return {
        content: [{ type: "text", text: JSON.stringify(res.data) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
