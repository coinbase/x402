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
import { createPaymentMiddleware, exact } from "@x402/express";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  routes: {
    "GET /weather": {
      network: "eip155:84532",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
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
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar } from "@x402/extensions";

app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  extensions: [
    bazaar({
      description: "Get current weather data",
      inputSchema: {
        queryParams: {
          location: {
            type: "string",
            description: "City name or coordinates",
            required: true
          }
        }
      }
    })
  ],
  routes: {
    "/api/weather": {
      network: "eip155:84532",
      scheme: exact({ amount: "$0.001" })
    }
  }
}));
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

**Learn more:** [Extensions Overview](../extensions/overview.md) | [Bazaar Discovery](../extensions/bazaar.md)

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
import { createPaymentMiddleware, exact } from "@x402/express";

// With extensions
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar, analytics } from "@x402/extensions";
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
import { createPaymentMiddleware, exact } from "@x402/express";
import { bazaar } from "@x402/extensions";

// Layer 3: Extensions (optional)
const extensions = [
  bazaar({
    description: "Premium weather data with forecasts",
    inputSchema: { /* ... */ }
  })
];

// Layer 2: Scheme (required)
const weatherScheme = exact({ amount: "$0.01" });

// Layer 1: Transport (automatic)
app.use(createPaymentMiddleware({
  recipient: "0xYourAddress",
  facilitator: { url: "https://x402.org/facilitator" },
  extensions,  // Layer 3
  routes: {
    "/api/weather": {
      network: "eip155:84532",
      scheme: weatherScheme  // Layer 2
    }
  }
  // Layer 1 (HTTP 402) is handled automatically
}));
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
createPaymentMiddleware({
  recipient: "0xAddress",
  facilitator: { url: "https://x402.org/facilitator" },
  routes: {
    "GET /weather": {
      network: "eip155:84532",
      scheme: exact({ amount: "$0.001" })
    }
  }
})
```

The V2 approach makes it clear which layer each configuration belongs to and allows for easier extension.

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
- [Extensions Overview](../extensions/overview.md) - Learn about available extensions
- [Lifecycle Hooks](../advanced/lifecycle-hooks.md) - Advanced customization