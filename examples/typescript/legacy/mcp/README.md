# x402 MCP Example Client

This is an example client that demonstrates how to use the x402 payment protocol with the Model Context Protocol (MCP) to make paid API requests through an MCP server.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A running x402 server (you can use the example express server at `examples/typescript/servers/express`)
- A valid Ethereum private key for making payments
- Claude Desktop with MCP support

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd clients/mcp
```

2. Copy `.env-local` to `.env` and add your Ethereum private key:
```bash
cp .env-local .env
```

3. Configure Claude Desktop MCP settings:
```json
{
  "mcpServers": {
    "demo": {
      "command": "pnpm",
      "args": [
        "--silent",
        "-C",
        "<absolute path to this repo>/examples/typescript/mcp",
        "dev"
      ],
      "env": {
        "PRIVATE_KEY": "<private key of a wallet with USDC on Base Sepolia>",
        "RESOURCE_SERVER_URL": "http://localhost:4021",
        "ENDPOINT_PATH": "/weather"
      }
    }
  }
}
```

4. Start the example client (remember to be running a server or pointing to one in the .env file):
```bash
pnpm dev
```

## How It Works

The example demonstrates how to:
1. Create a wallet client using viem
2. Set up an MCP server with x402 payment handling
3. Create a tool that makes paid API requests
4. Handle responses and errors through the MCP protocol

## Example Code

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { createWalletClient, Hex, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { withPaymentInterceptor } from "x402-axios";

// Create wallet client
const wallet = createWalletClient({
  chain: baseSepolia,
  transport: http(),
  account: privateKeyToAccount(PRIVATE_KEY as Hex),
}).extend(publicActions);

// Create Axios instance with payment handling
const client = withPaymentInterceptor(axios.create({ baseURL: RESOURCE_SERVER_URL }), wallet);

// Create MCP server
const server = new McpServer({
  name: "x402 MCP Client Demo",
  version: "1.0.0",
});

// Add tool for making paid requests
server.tool("get-data-from-resource-server", "Get data from the resource server (in this example, the weather)",  {}, async () => {
  const res = await client.post(`${ENDPOINT_PATH}`);
  return {
    content: [{ type: "text", text: JSON.stringify(res.data) }],
  };
});

// Connect to MCP transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Response Handling

### Payment Required (402)
When a payment is required, the MCP server will:
1. Receive the 402 response
2. Parse the payment requirements
3. Create and sign a payment header
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

## Extending the Example

To use this pattern in your own application:

1. Install the required dependencies:
```bash
npm install @modelcontextprotocol/sdk x402-axios viem
```

2. Set up your environment variables
3. Create a wallet client
4. Set up your MCP server with x402 payment handling
5. Define your tools for making paid requests
6. Connect to the MCP transport

## Integration with Claude Desktop

This example is designed to work with Claude Desktop's MCP support. The MCP server will:
1. Listen for tool requests from Claude
2. Handle the payment process automatically
3. Return the response data through the MCP protocol
4. Allow Claude to process and display the results
