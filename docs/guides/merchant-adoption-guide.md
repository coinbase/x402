---
title: "Merchant Adoption Guide"
description: "Learn how to convert an existing API into a pay-per-call service using x402. This guide covers pricing strategies, multi-chain configuration, testing workflows, and best practices for merchants who want to monetize their APIs."
---

### Why Monetize APIs with x402?

The x402 protocol enables **machine-payable APIs** — any HTTP endpoint can charge per request using a standard HTTP 402 response. This is especially powerful for:

- **AI/ML APIs** — LLM completions, embeddings, image generation, and data enrichment accessed by autonomous agents
- **Data APIs** — market data, analytics, on-chain metrics, and real-time feeds
- **Developer tools** — code generation, linting, testing, and deployment services

Buyers pay directly from their wallets with **zero onboarding friction** — no API keys to manage, no billing dashboards, no credit card forms.

***

### Prerequisites

Before starting, read the [Quickstart for Sellers](/getting-started/quickstart-for-sellers) to set up the technical foundation. This guide assumes you have:

* A working API or service
* A receiving wallet (EVM and/or SVM)
* Familiarity with x402 middleware setup for your framework

***

### Pricing Strategies

Choosing the right price is critical for adoption. Here are common approaches:

#### Per-Request Pricing

The simplest model — charge a fixed amount per API call. Works well for well-defined operations.

```typescript
// Fixed price per endpoint
const routes = {
  "GET /api/v1/summarize": {
    accepts: [{
      scheme: "exact",
      price: "$0.001",        // $0.001 per summary
      network: "eip155:8453",
      payTo: receivingAddress,
    }],
    description: "Summarize text using AI",
    mimeType: "application/json",
  },
};
```

#### Tiered Pricing

Different prices for different levels of service. Charge more for premium features or higher resource usage.

```typescript
const routes = {
  // Standard tier — basic summary
  "GET /api/v1/summarize": {
    accepts: [{
      scheme: "exact",
      price: "$0.001",
      network: "eip155:8453",
      payTo: receivingAddress,
    }],
    description: "Summarize text (standard quality)",
    mimeType: "application/json",
  },
  // Premium tier — detailed analysis
  "GET /api/v1/analyze": {
    accepts: [{
      scheme: "exact",
      price: "$0.005",
      network: "eip155:8453",
      payTo: receivingAddress,
    }],
    description: "Full analysis with citations",
    mimeType: "application/json",
  },
};
```

#### Free Tier + Paid Endpoints

Offer some endpoints for free to attract developers, then charge for premium endpoints.

```typescript
const routes = {
  // Free endpoint — no payment required
  "GET /api/v1/models": {
    // Not listed in routes config = free access
  },
  // Paid endpoint — inference
  "POST /api/v1/completions": {
    accepts: [{
      scheme: "exact",
      price: "$0.002",
      network: "eip155:8453",
      payTo: receivingAddress,
    }],
    description: "Generate completions",
    mimeType: "application/json",
  },
};
```

#### Pricing Guidelines

| Approach | Best For | Example Price Range |
|----------|----------|-------------------|
| Micro-transactions | High-volume, low-cost operations | $0.0001 – $0.01 per call |
| Standard API | Typical developer tools and data APIs | $0.01 – $0.10 per call |
| Premium AI | LLM inference, image generation | $0.01 – $1.00 per call |
| Enterprise data | Proprietary analytics, market data | $0.10 – $5.00 per call |

**Tips:**
- Start low to attract early adopters, then adjust based on usage
- Testnet pricing can be different from mainnet pricing
- Consider the cost of running your service when setting prices
- AI agents are the primary buyers — they compare prices automatically

***

### Converting an Existing API

#### Step 1: Identify Which Endpoints to Monetize

Not every endpoint needs to be paid. Consider:

- **Monetize**: endpoints with clear value, compute cost, or proprietary data
- **Keep free**: health checks, documentation, public metadata, authentication endpoints

```python
# Example: Only monetize data endpoints, keep health checks free
routes = {
    "GET /health": {},  # Free — not in payment config
    "GET /api/v1/market-data": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                pay_to=evm_address,
                price="$0.01",
                network="eip155:8453",
            ),
        ],
        mime_type="application/json",
        description="Real-time market data",
    ),
}
```

#### Step 2: Add the Payment Middleware

Wrap your existing routes with the x402 middleware. The middleware intercepts requests to protected endpoints and handles the payment handshake automatically.

<Tabs>
  <Tab title="Express">
    ```typescript
    import express from "express";
    import { paymentMiddleware, x402ResourceServer } from "@x402/express";
    import { ExactEvmScheme } from "@x402/evm/exact/server";
    import { HTTPFacilitatorClient } from "@x402/core/server";

    const app = express();
    const facilitatorClient = new HTTPFacilitatorClient({
      url: "https://x402.org/facilitator"
    });
    const server = new x402ResourceServer(facilitatorClient);
    server.register("eip155:*", new ExactEvmScheme());

    // Your existing routes below — middleware handles the rest
    app.use(paymentMiddleware(yourRoutesConfig, server));
    ```
  </Tab>
  <Tab title="FastAPI">
    ```python
    from fastapi import FastAPI
    from x402.http import HTTPFacilitatorClient, FacilitatorConfig
    from x402.http.middleware.fastapi import PaymentMiddlewareASGI
    from x402.mechanisms.evm.exact import ExactEvmServerScheme
    from x402.server import x402ResourceServer

    app = FastAPI()
    facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://x402.org/facilitator"))
    server = x402ResourceServer(facilitator)
    server.register("eip155:8453", ExactEvmServerScheme())

    app.add_middleware(PaymentMiddlewareASGI, routes=your_routes, server=server)
    ```
  </Tab>
</Tabs>

#### Step 3: Test with the x402 Client

Before going live, verify your endpoints work with the x402 buyer SDK:

<Tabs>
  <Tab title="TypeScript">
    ```typescript
    import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
    import { ExactEvmScheme } from "@x402/evm/exact/client";
    import { privateKeyToAccount } from "viem/accounts";
    import axios from "axios";

    const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
    const client = new x402Client();
    client.register("eip155:*", new ExactEvmScheme(signer));

    const api = wrapAxiosWithPayment(
      axios.create({ baseURL: "http://localhost:3000" }),
      client,
    );

    // This should trigger the payment handshake
    const response = await api.get("/api/v1/market-data");
    console.log(response.data);
    ```
  </Tab>
  <Tab title="Python">
    ```python
    from eth_account import Account
    from x402 import x402Client
    from x402.http.clients import x402HttpxClient
    from x402.mechanisms.evm import EthAccountSigner
    from x402.mechanisms.evm.exact.register import register_exact_evm_client

    client = x402Client()
    account = Account.from_key(os.getenv("EVM_PRIVATE_KEY"))
    register_exact_evm_client(client, EthAccountSigner(account))

    async with x402HttpxClient(client) as http:
        response = await http.get("http://localhost:3000/api/v1/market-data")
        print(response.text)
    ```
  </Tab>
</Tabs>

#### Step 4: Handle Edge Cases

- **CORS**: Ensure your server sends appropriate CORS headers so browser-based clients can complete the payment flow
- **Timeouts**: Payment transactions can take a few seconds. Ensure your server and client have appropriate timeout settings
- **Idempotency**: x402 payments are idempotent by design — the same payment signature can't be used twice
- **Error responses**: If payment verification fails, return a clear 402 response with updated requirements

***

### Multi-Chain Support

Accepting payments across multiple chains increases your potential buyer pool. x402 supports EVM chains (Base, Ethereum) and Solana out of the box.

#### Accepting Both EVM and Solana

```typescript
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

const server = new x402ResourceServer(facilitatorClient);

// Register EVM scheme
server.register("eip155:*", new ExactEvmScheme());

// Register SVM (Solana) scheme
server.register("solana:*", new ExactSvmScheme());
```

Then configure your routes to accept both:

```typescript
const routes = {
  "GET /api/v1/data": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.01",
        network: "eip155:8453",    // Base Mainnet
        payTo: evmAddress,
      },
      {
        scheme: "exact",
        price: "$0.01",
        network: "solana:mainnet",  // Solana Mainnet
        payTo: svmAddress,
      },
    ],
    description: "Data endpoint accepting both EVM and Solana payments",
    mimeType: "application/json",
  },
};
```

The buyer's client automatically selects the matching network based on their wallet.

#### Supported Networks

See [Network and Token Support](/core-concepts/network-and-token-support) for the full list of supported chains and tokens.

***

### Going to Production

#### Switch from Testnet to Mainnet

<Tabs>
  <Tab title="TypeScript">
    ```typescript
    // Testnet facilitator
    const testFacilitator = new HTTPFacilitatorClient({
      url: "https://x402.org/facilitator"
    });

    // Mainnet facilitator
    const mainFacilitator = new HTTPFacilitatorClient({
      url: "https://x402.org/facilitator"  // Same URL — the facilitator handles both
    });
    ```
  </Tab>
</Tabs>

The key change is in your route configuration — update the `network` field to mainnet CAIP-2 IDs:

| Testnet | Mainnet |
|---------|---------|
| `eip155:84532` (Base Sepolia) | `eip155:8453` (Base) |
| `eip155:11155111` (Sepolia) | `eip155:1` (Ethereum) |
| `solana:devnet` | `solana:mainnet` |

#### Monitoring

- **Track payments**: Monitor your receiving wallet(s) for incoming transactions
- **Log requests**: Log each paid request for analytics and debugging
- **Set up alerts**: Configure alerts for unusual payment patterns or errors

#### Best Practices

1. **Start with testnet** — verify the full payment flow before accepting real funds
2. **Keep some endpoints free** — a free tier helps developers discover your API
3. **Document your pricing** — clearly state what each endpoint costs and what buyers receive
4. **Monitor gas costs** — on EVM chains, buyers pay gas separately from your price
5. **Handle failed payments gracefully** — return clear 402 responses with updated requirements
6. **Version your API** — use URL versioning (`/api/v1/`) so you can adjust pricing in v2 without breaking existing buyers

***

### Common Questions

**Can I offer different prices on different chains?**

Yes. Use different `accepts` entries with different prices for each network.

**What happens if a buyer doesn't have enough funds?**

The payment will fail during the transaction step, and the buyer's client will receive an error. The x402 protocol handles this transparently.

**Can I change prices after launch?**

Yes. Update your route configuration and redeploy. The new prices apply to subsequent requests.

**Do buyers need an account?**

No. x402 is accountless — buyers pay directly from their wallets with no sign-up required.

**What about refunds?**

x402 is a push payment system — once a payment is confirmed, it cannot be reversed. If you need refund capabilities, implement them at the application level.

***

### Next Steps

- [Quickstart for Sellers](/getting-started/quickstart-for-sellers) — detailed setup instructions
- [Network and Token Support](/core-concepts/network-and-token-support) — supported chains and tokens
- [MCP Server with x402](/guides/mcp-server-with-x402) — make your API available to AI agents via MCP
- [x402 on GitHub](https://github.com/coinbase/x402) — SDKs, examples, and contribution guide
