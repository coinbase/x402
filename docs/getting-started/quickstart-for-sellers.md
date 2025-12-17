# Quickstart for Sellers

This guide walks you through integrating with **x402** to enable payments for your API or service. By the end, your API will be able to charge buyers and AI agents for access.

### Prerequisites

Before you begin, ensure you have:

* A crypto wallet to receive funds (any EVM-compatible wallet)
* [Node.js](https://nodejs.org/en) and npm (or Python and pip) installed
* An existing API or server



**Note**\
We have pre-configured examples available in our repo for both [Node.js](https://github.com/coinbase/x402/tree/main/examples/typescript/servers) and [Python](https://github.com/coinbase/x402/tree/main/examples/python/servers). We also have an [advanced example](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/advanced) that shows how to use the x402 SDKs to build a more complex payment flow.

### 1. Install Dependencies

#### Node.js

{% tabs %}
{% tab title="Express" %}
Install the [x402 Express middleware package](https://www.npmjs.com/package/@x402/express).

```bash
npm install @x402/express @x402/core @x402/evm
npm install @coinbase/x402 # for the mainnet facilitator
```
{% endtab %}

{% tab title="Next.js" %}
Install the [x402 Next.js middleware package](https://www.npmjs.com/package/@x402/next).

```bash
npm install @x402/next @x402/core @x402/evm
npm install @coinbase/x402 # for the mainnet facilitator
```
{% endtab %}

{% tab title="Hono" %}
Install the [x402 Hono middleware package](https://www.npmjs.com/package/@x402/hono).

```bash
npm install @x402/hono @x402/core @x402/evm
npm install @coinbase/x402 # for the mainnet facilitator
```
{% endtab %}

{% tab title="MCP (Unofficial)" %}
This [community package](https://github.com/ethanniser/x402-mcp) showcases how you can use MCP (Model Context Protocol) with x402. We're working on enshrining an official MCP spec in x402 soon.

Install the [x402-mcp package](https://www.npmjs.com/package/x402-mcp):

```bash
npm install x402-mcp
npm install @coinbase/x402 # for the mainnet facilitator
```

Full example in the repo [here](https://github.com/ethanniser/x402-mcp/tree/main/apps/example).
{% endtab %}
{% endtabs %}

#### Python

{% tabs %}
{% tab title="FastAPI/Flask" %}
[Install the x402 Python package](../)

```bash
pip install x402
pip install cdp # for the mainnet facilitator
```
{% endtab %}
{% endtabs %}

### 2. Add Payment Middleware

Integrate the payment middleware into your application. You will need to provide:

* The Facilitator URL or facilitator object. For testing, use `https://x402.org/facilitator` which works on Base Sepolia and Solana devnet.
  * For more information on running in production on mainnet, check out [CDP's Quickstart for Sellers](https://docs.cdp.coinbase.com/x402/docs/quickstart-sellers)
* The routes you want to protect.
* Your receiving wallet address.

{% tabs %}
{% tab title="Express" %}
Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/express).

```javascript
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const app = express();

// Create facilitator client (use https://x402.org/facilitator for testnet)
const facilitatorClient = new HTTPFacilitatorClient({ 
  url: "https://x402.org/facilitator" 
});

// Create resource server and register the EVM scheme
const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme());

// Configure payment middleware
app.use(paymentMiddleware(
  {
    "GET /weather": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.001", // USDC amount in dollars
          network: "eip155:84532", // Base Sepolia (CAIP-2 format)
          payTo: "0xYourAddress", // Your receiving wallet address
        },
      ],
      description: "Weather data",
      mimeType: "application/json",
    },
  },
  server,
));

// Implement your route
app.get("/weather", (req, res) => {
  res.send({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

app.listen(4021, () => {
  console.log(`Server listening at http://localhost:4021`);
});
```
{% endtab %}

{% tab title="Next.js" %}
Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/typescript/fullstack/next). Since this is a fullstack example, we recommend using the example to build this yourself, and treat the code snippet below as a reference.

```javascript
import { paymentProxy, x402ResourceServer } from '@x402/next';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ 
  url: "https://x402.org/facilitator" 
});

// Create resource server and register the EVM scheme
const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme());

// Configure the payment proxy
export const middleware = paymentProxy(
  {
    '/protected': {
      accepts: [
        {
          scheme: "exact",
          price: '$0.01',
          network: "eip155:84532", // Base Sepolia (CAIP-2 format)
          payTo: "0xYourAddress", // Your receiving wallet address
        },
      ],
      description: 'Access to protected content',
    },
  },
  server,
);

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/protected/:path*',
  ]
};
```
{% endtab %}

{% tab title="Hono" %}
Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/hono).

```javascript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const app = new Hono();

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ 
  url: "https://x402.org/facilitator" 
});

// Create resource server and register the EVM scheme
const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme());

// Configure the payment middleware
app.use(paymentMiddleware(
  {
    "/protected-route": {
      accepts: [
        {
          scheme: "exact",
          price: "$0.10",
          network: "eip155:84532", // Base Sepolia (CAIP-2 format)
          payTo: "0xYourAddress", // Your receiving wallet address
        },
      ],
      description: "Access to premium content",
    },
  },
  server,
));

// Implement your route
app.get("/protected-route", (c) => {
  return c.json({ message: "This content is behind a paywall" });
});

serve({
  fetch: app.fetch,
  port: 3000
});
```
{% endtab %}

{% tab title="MCP (Unofficial)" %}
This creates an MCP server endpoint that exposes paid tools to AI agents. The tools automatically handle x402 payment requirements when called.

```javascript
import { createPaidMcpHandler } from "x402-mcp";
import z from "zod";
// import { facilitator } from "@coinbase/x402"; // For mainnet

const handler = createPaidMcpHandler(
  (server) => {
    server.paidTool(
      "get_random_number",
      "Get a random number between two numbers",
      { price: 0.001 }, // Price in USD
      {
        min: z.number().int().describe("Minimum value"),
        max: z.number().int().describe("Maximum value"),
      },
      {},
      async (args) => {
        const randomNumber =
          Math.floor(Math.random() * (args.max - args.min + 1)) + args.min;
        return {
          content: [{ type: "text", text: randomNumber.toString() }],
        };
      }
    );

    // Add more paid tools as needed
    server.paidTool(
      "premium_feature",
      "Access premium functionality",
      { price: 0.01 },
      {
        input: z.string(),
      },
      {},
      async (args) => {
        // Your premium feature logic
        return {
          content: [{ type: "text", text: "Premium result" }],
        };
      }
    );
  },
  {
    serverInfo: {
      name: "your-mcp-server",
      version: "1.0.0",
    },
  },
  {
    recipient: "0xYourAddress", // Your receiving wallet address
    facilitator,
    // network: "base-sepolia", // For testnet, "base" for mainnet
  }
);

export { handler as GET, handler as POST };
```
{% endtab %}

{% tab title="FastAPI" %}
Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/python/servers/fastapi).

```python
from typing import Any, Dict
from fastapi import FastAPI
from x402.fastapi.middleware import require_payment

app = FastAPI()

# Apply payment middleware to specific routes
app.middleware("http")(
    require_payment(
        path="/weather",
        price="$0.001",
        pay_to_address="0xYourAddress",
        network="base-sepolia",
    )
)

@app.get("/weather")
async def get_weather() -> Dict[str, Any]:
    return {
        "report": {
            "weather": "sunny",
            "temperature": 70,
        }
    }

```
{% endtab %}

{% tab title="Flask" %}
Full example in the repo [here](https://github.com/coinbase/x402/tree/main/examples/python/servers/flask).&#x20;

```python
from flask import Flask
from x402.flask.middleware import PaymentMiddleware

app = Flask(__name__)

# Initialize payment middleware
payment_middleware = PaymentMiddleware(app)

# Apply payment middleware to specific routes
payment_middleware.add(
    path="/weather",
    price="$0.001",
    pay_to_address="0xYourAddress",
    network="base-sepolia",
)
```
{% endtab %}
{% endtabs %}

### Understanding Network Identifiers

The network identifier format differs between SDK versions:

**TypeScript (V2 API)** uses [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md) format:
- Base Sepolia: `eip155:84532`
- Base Mainnet: `eip155:8453`
- Solana Devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`

**Python (V1 API)** uses string identifiers:
- Base Sepolia: `"base-sepolia"`
- Base Mainnet: `"base"`

**Wildcard Registration**: V2 SDKs support wildcard scheme registration for handling multiple networks:
```typescript
// Register once to handle all EVM chains
server.register("eip155:*", new ExactEvmScheme());

// Register once to handle all Solana clusters  
server.register("solana:*", new ExactSvmScheme());
```

**TypeScript V2 Route Configuration Interface:**

```typescript
// Payment option for a route (one way to pay)
interface PaymentOption {
  scheme: string;                     // Payment scheme (e.g., "exact")
  payTo: string;                      // Recipient wallet address
  price: string;                      // Price (e.g., "$0.001")
  network: string;                    // Network in CAIP-2 format (e.g., "eip155:84532")
  maxTimeoutSeconds?: number;         // Max time for payment (default: 60)
}

// Route configuration
interface RouteConfig {
  accepts: PaymentOption | PaymentOption[];  // Single or multiple payment options
  description?: string;               // Description of the resource
  mimeType?: string;                  // MIME type of the response
  resource?: string;                  // Resource URL (defaults to request URL)
  customPaywallHtml?: string;         // Custom HTML for the paywall
  extensions?: Record<string, unknown>; // Protocol extensions (e.g., bazaar)
}
```

**Python V1 Middleware Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `str` | Path pattern to protect |
| `price` | `str` | Payment amount (e.g., `"$0.001"`) |
| `pay_to_address` | `str` | Recipient wallet address |
| `network` | `str` | Network identifier (e.g., `"base-sepolia"`) |
| `description` | `str` | Optional resource description |
| `max_deadline_seconds` | `int` | Max time for payment (default: 60) |

When a request is made to this route without payment, your server will respond with the HTTP 402 Payment Required code and payment instructions.

### 3. Test Your Integration

To verify:

1. Make a request to your endpoint (e.g., `curl http://localhost:3000/your-endpoint`).
2. The server responds with a 402 Payment Required, including payment instructions in the body.
3. Complete the payment using a compatible client, wallet, or automated agent. This typically involves signing a payment payload, which is handled by the client SDK detailed in the Quickstart for Buyers.
4. Retry the request, this time including the `PAYMENT-SIGNATURE` header containing the cryptographic proof of payment (payment payload).
5. The server verifies the payment via the facilitator and, if valid, returns your actual API response (e.g., `{ "data": "Your paid API response." }`) with a `PAYMENT-RESPONSE` header containing the settlement confirmation.

**Note**: Both `PAYMENT-SIGNATURE` and `PAYMENT-RESPONSE` headers must be Base64-encoded JSON strings.

### 4. Error Handling

* If you get an error stating `Cannot find module 'x402-hono/express' or its corresponding type declarations.`, add the tsconfig.json from the [Hono example](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/express) to your project.
* `npm install` the dependencies in each example

### Next Steps

* Looking for something more advanced? Check out the [Advanced Example](https://github.com/coinbase/x402/tree/main/examples/typescript/servers/advanced)
* Get started as a buyer

For questions or support, join our [Discord](https://discord.gg/invite/cdp).

### Summary

This quickstart covered:

* Installing the x402 SDK and relevant middleware
* Adding payment middleware to your API and configuring it
* Testing your integration

Your API is now ready to accept crypto payments through x402.
