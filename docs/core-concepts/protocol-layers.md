# Protocol Layers

x402 V2 is built on a **layered architecture** that separates concerns and enables modular, extensible payment flows. This design allows developers to use only the components they need while maintaining compatibility across the ecosystem.

### Overview

The x402 protocol consists of three distinct layers:

1. **Transport Layer** - HTTP 402 protocol and communication
2. **Scheme Layer** - Payment calculation and verification logic
3. **Extension Layer** - Optional features and integrations

Each layer builds on the previous one, creating a flexible system that can adapt to different use cases while maintaining a consistent core protocol.

```
┌─────────────────────────────────────┐
│      Extension Layer                │
│  (Bazaar, Analytics, Reputation)    │
├─────────────────────────────────────┤
│      Scheme Layer                   │
│  (exact, upto, stream)              │
├─────────────────────────────────────┤
│      Transport Layer                │
│  (HTTP 402, Headers, Encoding)      │
└─────────────────────────────────────┘
```

---

## Layer 1: Transport Layer

The **Transport Layer** defines how payment requirements are communicated over HTTP and how payment proofs are exchanged between clients and servers.

### Core Components

* **HTTP 402 Status Code** - Signals payment is required
* **Payment Headers** - `PAYMENT-SIGNATURE` and `PAYMENT-RESPONSE`
* **Base64 Encoding** - Ensures compatibility across HTTP implementations
* **JSON Payloads** - Structured payment data

### How It Works

1. **Client requests a resource** without payment
2. **Server responds with 402** including payment requirements in the response body
3. **Client prepares payment** and includes `PAYMENT-SIGNATURE` header (Base64-encoded)
4. **Server verifies and settles** the payment
5. **Server responds with resource** and `PAYMENT-RESPONSE` header (Base64-encoded)

### Example: Transport Layer Headers

```typescript
// Client sends payment proof
const paymentSignature = btoa(JSON.stringify(paymentPayload));
headers['PAYMENT-SIGNATURE'] = paymentSignature;

// Server returns settlement confirmation
const paymentResponse = btoa(JSON.stringify(settlementData));
headers['PAYMENT-RESPONSE'] = paymentResponse;
```

The Transport Layer is **protocol-agnostic** - it doesn't care about payment amounts, tokens, or networks. It simply defines how payment information flows over HTTP.

**Learn more:** [HTTP 402](http-402.md) | [Client / Server](client-server.md)

---

## Layer 2: Scheme Layer

The **Scheme Layer** defines how payments are calculated, verified, and settled. Different schemes enable different payment models.

### Available Schemes

#### 1. `exact` Scheme (Available Now)

Fixed-price payments where the exact amount is known upfront.

**Use cases:**
- Per-request API pricing
- Fixed content access fees
- Subscription-style payments

**Example:**
```typescript
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator"
});
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

app.use(paymentMiddleware(
  {
    "GET /weather": {
      accepts: [{
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",
        payTo: "0xYourAddress",
      }],
    },
  },
  server,
));
```

#### 2. `upto` Scheme (Coming Soon)

Variable pricing where the final cost depends on usage (tokens, data, compute time).

**Use cases:**
- LLM API calls (pay per token)
- Data transfer (pay per MB)
- Compute resources (pay per second)

**Example (Future):**
```typescript
scheme: upto({
  maxAmount: "$1.00",
  unit: "token",
  rate: "$0.0001"
})
```

#### 3. `stream` Scheme (Planned)

Continuous micropayments for ongoing services.

**Use cases:**
- Real-time data feeds
- Streaming media
- Long-running computations

### Scheme Benefits

* **Modularity** - Add new schemes without changing the transport layer
* **Flexibility** - Different endpoints can use different schemes
* **Extensibility** - Custom schemes can be implemented for specific use cases

**Learn more:** [Facilitator](facilitator.md) | [Networks & Assets](network-and-token-support.md)

---

## Layer 3: Extension Layer

The **Extension Layer** provides optional features that enhance the core protocol without adding complexity for users who don't need them.

### Available Extensions

#### Bazaar Discovery Extension

Enables automatic service discovery and marketplace integration.

**Features:**
- Automatic endpoint registration
- Machine-readable service catalogs
- AI agent discovery

**Example:**
```typescript
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator"
});
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

app.use(paymentMiddleware(
  {
    "/api/weather": {
      accepts: [{
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",
        payTo: "0xYourAddress",
      }],
      description: "Get current weather data",
      extensions: {
        bazaar: {
          discoverable: true,
          inputSchema: {
            queryParams: {
              location: {
                type: "string",
                description: "City name or coordinates",
                required: true
              }
            }
          }
        }
      }
    }
  },
  server,
));
```

#### Analytics Extension (Coming Soon)

Track payment metrics and usage patterns.

**Features:**
- Request/payment analytics
- Revenue tracking
- Usage patterns

#### Reputation Extension (Planned)

Build trust through on-chain reputation scores.

**Features:**
- Service quality ratings
- Payment history
- Dispute resolution

### Extension Benefits

* **Opt-in** - Only include extensions you need
* **Composable** - Combine multiple extensions
* **Independent** - Extensions don't affect core protocol
* **Upgradeable** - New extensions can be added without breaking changes

**Learn more:** [Bazaar Discovery Layer](bazaar-discovery-layer.md)

---

## Benefits of Layered Architecture

### 1. Separation of Concerns

Each layer has a single, well-defined responsibility:
- Transport handles communication
- Schemes handle payment logic
- Extensions handle optional features

### 2. Modularity

Use only what you need:

```typescript
// Minimal setup - just transport + exact scheme
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

// With extensions - configure in route config
// Extensions like bazaar are specified per-route in the accepts config
```

### 3. Extensibility

Add new capabilities without breaking existing implementations:
- New schemes (upto, stream) work with existing transport
- New extensions don't affect core protocol
- Custom implementations can extend any layer

### 4. Interoperability

All x402 implementations share the same transport layer, ensuring compatibility:
- Different schemes can coexist
- Extensions are optional and discoverable
- Clients and servers can negotiate capabilities

### 5. Future-Proof

The layered design allows the protocol to evolve:
- Add new schemes without protocol changes
- Introduce extensions without breaking changes
- Support new networks and tokens at the scheme layer

---

## How Layers Work Together

Here's a complete example showing all three layers:

```typescript
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

// Layer 1: Transport (automatic via HTTP 402)
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator"
});

// Layer 2: Scheme (required - register payment schemes)
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

// Layer 3: Extensions + Routes (configure per-route)
app.use(paymentMiddleware(
  {
    "/api/weather": {
      accepts: [{
        scheme: "exact",        // Layer 2: exact payment scheme
        price: "$0.01",
        network: "eip155:84532",
        payTo: "0xYourAddress",
      }],
      description: "Premium weather data with forecasts",
      extensions: {             // Layer 3: optional extensions
        bazaar: {
          discoverable: true,
        }
      }
    }
  },
  server,
));
// Layer 1 (HTTP 402 headers) is handled automatically
```

**What happens:**
1. **Transport Layer** - Client receives 402 with payment requirements
2. **Scheme Layer** - Client calculates exact payment amount
3. **Extension Layer** - Service is discoverable via Bazaar
4. **Transport Layer** - Client sends payment via `PAYMENT-SIGNATURE` header
5. **Scheme Layer** - Server verifies payment matches exact amount
6. **Transport Layer** - Server returns resource with `PAYMENT-RESPONSE` header

---

## Migration from V1

V1 used a flat configuration model. V2's layered approach provides the same functionality with better organization:

**V1 (Flat):**
```typescript
paymentMiddleware(
  "0xAddress",
  { "GET /weather": { price: "$0.001", network: "base-sepolia" } },
  { url: "https://x402.org/facilitator" }
)
```

**V2 (Layered):**
```typescript
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator"
});
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

app.use(paymentMiddleware(
  {
    "GET /weather": {
      accepts: [{
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",
        payTo: "0xAddress",
      }],
    },
  },
  server,
));
```

The V2 approach separates concerns: facilitator client handles communication, resource server manages scheme registration, and routes define payment requirements per-endpoint.

---

## Summary

x402's layered architecture provides:

* **Transport Layer** - HTTP 402 communication protocol
* **Scheme Layer** - Payment calculation and verification (exact, upto, stream)
* **Extension Layer** - Optional features (bazaar, analytics, reputation)

This design enables:
- Modular implementations
- Easy extensibility
- Clear separation of concerns
- Future-proof protocol evolution

**Next steps:**
- [Quickstart for Sellers](../getting-started/quickstart-for-sellers.md) - Start accepting payments
- [Bazaar Discovery Layer](bazaar-discovery-layer.md) - Service discovery for AI agents
