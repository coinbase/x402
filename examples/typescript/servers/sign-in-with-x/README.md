# Sign-In-With-X (SIWX) Server Example

Express.js server demonstrating how to implement Sign-In-With-X authentication, allowing clients to prove prior payment via wallet signatures instead of paying again on subsequent requests.

```typescript
import express from "express";
import { paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import {
  declareSIWxExtension,
  siwxResourceServerExtension,
  createSIWxSettleHook,
  createSIWxRequestHook,
  InMemorySIWxStorage,
} from "@x402/extensions/sign-in-with-x";

const storage = new InMemorySIWxStorage();

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(siwxResourceServerExtension)
  .onAfterSettle(createSIWxSettleHook({ storage }));

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(createSIWxRequestHook({ storage }));

const app = express();
app.use(paymentMiddlewareFromHTTPServer(httpServer));
```

## How It Works

1. **Client pays** — First request requires payment
2. **Server records** — Payment recorded against wallet address in storage
3. **Client signs** — Subsequent requests include SIWX signature
4. **Server verifies** — Signature proves wallet ownership, grants access without payment

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- Valid EVM address (SVM optional)
- Facilitator URL (see [facilitator list](https://www.x402.org/ecosystem?category=facilitators))

## Setup

1. Copy `.env-local` to `.env`:

```bash
cp .env-local .env
```

and fill required environment variables:

- `FACILITATOR_URL` - Facilitator endpoint URL
- `EVM_ADDRESS` - Ethereum address to receive payments
- `SVM_ADDRESS` - (Optional) Solana address for SVM payments

2. Install and build from typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd servers/sign-in-with-x
```

3. Run the server:

```bash
pnpm dev
```

## Testing the Server

Start the SIWX client to test:

```bash
cd ../../clients/sign-in-with-x
# Ensure .env is setup with EVM_PRIVATE_KEY
pnpm start
```

The client will:
1. Make first request and pay for `/weather`
2. Make second request with SIWX signature (no payment)
3. Make first request and pay for `/joke`
4. Make second request with SIWX signature (no payment)

## Example Endpoints

- `GET /weather` — Weather data ($0.001 USDC)
- `GET /joke` — Joke content ($0.001 USDC)

Each endpoint requires payment once per wallet address. Subsequent requests from the same wallet authenticate via SIWX signature.

## SIWX Extension Configuration

The server uses three key components:

### 1. Extension Declaration

```typescript
const routes = {
  "GET /weather": {
    accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: evmAddress }],
    description: "Weather data",
    mimeType: "application/json",
    extensions: declareSIWxExtension(), // Announces SIWX support
  },
};
```

### 2. Settle Hook (Records Payments)

```typescript
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(siwxResourceServerExtension)
  .onAfterSettle(createSIWxSettleHook({ storage })); // Records paid addresses
```

### 3. Request Hook (Verifies SIWX)

```typescript
const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest(createSIWxRequestHook({ storage })); // Checks SIWX auth
```

## Storage Backend

This example uses in-memory storage (`InMemorySIWxStorage`). For production, implement persistent storage:

```typescript
import { SIWxStorage } from "@x402/extensions/sign-in-with-x";

class RedisSIWxStorage implements SIWxStorage {
  async recordPayment(address: string, resource: string): Promise<void> {
    // Store in Redis/database
  }

  async hasAccess(address: string, resource: string): Promise<boolean> {
    // Check Redis/database
  }
}

const storage = new RedisSIWxStorage();
```

## Optional SVM Support

To enable Solana (SVM) payments, provide `SVM_ADDRESS` in `.env`:

```typescript
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme());
```

## Event Logging

Monitor SIWX events:

```typescript
function onEvent(event: { type: string; resource: string; address?: string }) {
  console.log(`[SIWX] ${event.type}`, event);
}

createSIWxRequestHook({ storage, onEvent });
```

Event types:
- `payment_recorded` — Wallet paid for resource
- `access_granted` — SIWX signature verified
- `access_denied` — Invalid or missing signature