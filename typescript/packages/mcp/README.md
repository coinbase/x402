# @x402/mcp

MCP (Model Context Protocol) integration for the x402 payment protocol. This package enables paid tool calls in MCP servers and automatic payment handling in MCP clients.

## Installation

```bash
npm install @x402/mcp @x402/core @modelcontextprotocol/sdk
```

## Quick Start (Recommended)

### Server - Using Factory Function

```typescript
import { createX402MCPServer } from "@x402/mcp";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { z } from "zod";

// Create server with factory (simplest approach)
const server = createX402MCPServer({
  name: "premium-api",
  version: "1.0.0",
  facilitator: "https://x402.org/facilitator",
  schemes: [{ network: "eip155:84532", server: new ExactEvmScheme() }],
});

await server.initialize();

// Register a paid tool
server.paidTool(
  "financial_analysis",
  {
    description: "Advanced AI-powered financial analysis",
    inputSchema: { ticker: z.string() },
  },
  {
    scheme: "exact",
    network: "eip155:84532",
    price: "$0.10",
    payTo: "0x...",
  },
  async ({ ticker }) => {
    const analysis = await performAnalysis(ticker);
    return { content: [{ type: "text", text: analysis }] };
  }
);

// Register a free tool (also through x402Server for consistency)
server.tool("ping", "Health check", {}, async () => ({
  content: [{ type: "text", text: "pong" }],
}));

// Connect to transport
await server.server.connect(transport);
```

### Client - Using Factory Function

```typescript
import { createX402MCPClient } from "@x402/mcp";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Create client with factory (simplest approach)
const client = createX402MCPClient({
  name: "my-agent",
  version: "1.0.0",
  schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(walletAccount) }],
  autoPayment: true,
  onPaymentRequested: async ({ paymentRequired }) => {
    console.log(`Tool requires payment: ${paymentRequired.accepts[0].amount}`);
    return true; // Return false to deny payment
  },
});

// Connect and use
const transport = new SSEClientTransport(new URL("http://localhost:4022/sse"));
await client.connect(transport);

const result = await client.callTool("financial_analysis", { ticker: "AAPL" });
console.log(result.content);

if (result.paymentMade) {
  console.log("Payment settled:", result.paymentResponse?.transaction);
}
```

## Advanced Usage (Low-Level API)

### Server - Manual Setup

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { x402MCPServer } from "@x402/mcp";
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

// Manual setup for advanced control
const mcpServer = new McpServer({ name: "premium-api", version: "1.0.0" });
const resourceServer = new x402ResourceServer(facilitatorClient);
resourceServer.register("eip155:84532", new ExactEvmScheme());
await resourceServer.initialize();

const x402Server = new x402MCPServer(mcpServer, resourceServer);

// Register tools...
x402Server.paidTool(...);
```

### Client - Wrapper Functions

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { wrapMCPClientWithPayment, wrapMCPClientWithPaymentFromConfig } from "@x402/mcp";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

// Option 1: Wrap existing client with existing payment client
const mcpClient = new Client({ name: "my-agent", version: "1.0.0" });
const paymentClient = new x402Client()
  .register("eip155:84532", new ExactEvmScheme(walletAccount));

const x402Mcp = wrapMCPClientWithPayment(mcpClient, paymentClient, {
  autoPayment: true,
});

// Option 2: Wrap existing client with config
const x402Mcp2 = wrapMCPClientWithPaymentFromConfig(mcpClient, {
  schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(walletAccount) }],
});
```

## Payment Flow

1. **Client calls tool** → No payment attached
2. **Server returns 402** → PaymentRequired in structured result (see SDK Limitation below)
3. **Client creates payment** → Using x402Client
4. **Client retries with payment** → PaymentPayload in `_meta["x402/payment"]`
5. **Server verifies & executes** → Tool runs if payment valid
6. **Server settles payment** → Transaction submitted
7. **Server returns result** → SettleResponse in `_meta["x402/payment-response"]`

## MCP SDK Limitation

The x402 MCP transport spec defines payment errors using JSON-RPC's native error format:
```json
{ "error": { "code": 402, "data": { /* PaymentRequired */ } } }
```

However, the MCP SDK converts `McpError` exceptions to tool results with `isError: true`, losing the `error.data` field. To work around this, we embed the error structure in the result content:

```json
{
  "content": [{ "type": "text", "text": "{\"x402/error\": {\"code\": 402, \"data\": {...}}}" }],
  "isError": true
}
```

The client parses this structure to extract PaymentRequired data. This is a pragmatic workaround that maintains compatibility while we track upstream SDK improvements.

## Configuration Options

### x402MCPClientOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoPayment` | `boolean` | `true` | Automatically retry with payment on 402 |
| `onPaymentRequested` | `function` | `() => true` | Hook for human-in-the-loop approval when payment is requested |

### X402MCPServerConfig (Factory)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | Required | MCP server name |
| `version` | `string` | Required | MCP server version |
| `facilitator` | `string \| FacilitatorClient` | Default facilitator | Facilitator for payment processing |
| `schemes` | `SchemeRegistration[]` | `[]` | Payment scheme registrations |
| `syncFacilitatorOnStart` | `boolean` | `true` | Initialize facilitator immediately |

### MCPToolPaymentConfig

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `scheme` | `string` | Yes | Payment scheme (e.g., "exact") |
| `network` | `Network` | Yes | CAIP-2 network ID (e.g., "eip155:84532") |
| `price` | `Price` | Yes | Price (e.g., "$0.10" or "1000000") |
| `payTo` | `string` | Yes | Recipient wallet address |
| `maxTimeoutSeconds` | `number` | No | Payment timeout (default: 60) |
| `extra` | `object` | No | Scheme-specific parameters (e.g., EIP-712 domain) |
| `resource` | `object` | No | Resource metadata |

## Hooks

### Client Hooks

```typescript
const client = createX402MCPClient({...});

// Called when a 402 is received (before payment)
// Return { payment } to use custom payment, { abort: true } to stop
client.onPaymentRequired(async ({ toolName, paymentRequired }) => {
  const cached = await cache.get(toolName);
  if (cached) return { payment: cached };
});

// Called before payment is created
client.onBeforePayment(async ({ paymentRequired }) => {
  await logPaymentAttempt(paymentRequired);
});

// Called after payment is submitted
client.onAfterPayment(async ({ paymentPayload, settleResponse }) => {
  await saveReceipt(settleResponse.transaction);
});
```

### Server Hooks

```typescript
const server = createX402MCPServer({...});

// Called after verification, before tool execution
// Return false to abort and return 402
server.onBeforeExecution(async ({ toolName, paymentPayload }) => {
  if (isBlocked(paymentPayload.signer)) {
    return false; // Aborts execution
  }
});

// Called after tool execution, before settlement
server.onAfterExecution(async ({ toolName, result }) => {
  metrics.recordExecution(toolName, result.isError);
});

// Called after successful settlement
server.onAfterSettlement(async ({ toolName, settlement }) => {
  await logTransaction(toolName, settlement.transaction);
});
```

## License

Apache-2.0
