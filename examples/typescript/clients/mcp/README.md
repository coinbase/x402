# x402 MCP Example Client

This is an example client that demonstrates how to use the x402 payment protocol (v2) with the Model Context Protocol (MCP) to make paid API requests through an MCP server.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A running x402 server (you can use the example express server at `examples/typescript/servers/express`)
- A valid Ethereum private key and/or Solana private key for making payments
- Claude Desktop with MCP support

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd clients/mcp
```

2. Configure Claude Desktop MCP settings:
```json
{
  "mcpServers": {
    "demo": {
      "command": "pnpm",
      "args": [
        "--silent",
        "-C",
        "<absolute path to this repo>/examples/typescript/clients/mcp",
        "dev"
      ],
      "env": {
        "EVM_PRIVATE_KEY": "<private key of a wallet with USDC on Base Sepolia>",
        "SVM_PRIVATE_KEY": "<base58-encoded private key of a Solana wallet with USDC on Devnet>",
        "RESOURCE_SERVER_URL": "http://localhost:4021",
        "ENDPOINT_PATH": "/weather"
      }
    }
  }
}
```

3. Make sure your x402 server is running at the URL specified in `RESOURCE_SERVER_URL` (e.g., the example express server at `examples/typescript/servers/express`)

4. Restart Claude Desktop to load the new MCP server

5. Ask Claude to use the `get-data-from-resource-server` tool

## How It Works

The example demonstrates how to:
1. Create an x402 client with EVM and SVM scheme support
2. Register payment schemes using `@x402/evm` and `@x402/svm`
3. Set up an MCP server with x402 payment handling
4. Create a tool that makes paid API requests
5. Handle responses and errors through the MCP protocol

## Example Code

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

// Create x402 client with payment schemes
const client = new x402Client();

// Register EVM scheme
const evmSigner = privateKeyToAccount(EVM_PRIVATE_KEY);
registerExactEvmScheme(client, { signer: evmSigner });

// Register SVM scheme
const svmSigner = await createKeyPairSignerFromBytes(base58.decode(SVM_PRIVATE_KEY));
registerExactSvmScheme(client, { signer: svmSigner });

// Create Axios instance with payment handling
const api = wrapAxiosWithPayment(axios.create({ baseURL: RESOURCE_SERVER_URL }), client);

// Create MCP server
const server = new McpServer({
  name: "x402 MCP Client Demo",
  version: "2.0.0",
});

// Add tool for making paid requests
server.tool(
  "get-data-from-resource-server",
  "Get data from the resource server (in this example, the weather)",
  {},
  async () => {
    const res = await api.get(ENDPOINT_PATH);
    return {
      content: [{ type: "text", text: JSON.stringify(res.data) }],
    };
  },
);

// Connect to MCP transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Response Handling

### Payment Required (402)
When a payment is required, the x402 client will:
1. Receive the 402 response
2. Parse the payment requirements
3. Create and sign a payment header using the appropriate scheme (EVM or SVM)
4. Automatically retry the request with the payment header

### Successful Response
After payment is processed, the MCP server will return the response data through the MCP protocol:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"report\":{\"weather\":\"sunny\",\"temperature\":70}}"
    }
  ]
}
```
## Integration with Claude Desktop

This example is designed to work with Claude Desktop's MCP support. The MCP server will:
1. Listen for tool requests from Claude
2. Handle the payment process automatically using x402 v2 protocol
3. Return the response data through the MCP protocol
4. Allow Claude to process and display the results
