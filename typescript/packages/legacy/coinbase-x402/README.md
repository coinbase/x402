# @coinbase/x402

The official Coinbase facilitator package for the x402 Payment Protocol. This package provides direct access to Coinbase's hosted facilitator service, enabling seamless payment verification and settlement.

## Installation

```bash
npm install @coinbase/x402
```

## Environment Variables

This package optionally uses CDP API keys from the [Coinbase Developer Platform](https://www.coinbase.com/developer-platform) for authenticated operations:

- `CDP_API_KEY_ID`: Your CDP API key ID
- `CDP_API_KEY_SECRET`: Your CDP API key secret

### Endpoint Authentication Requirements

| Endpoint | Authentication Required | Purpose |
|----------|------------------------|---------|
| `list` | ❌ No | Discover available bazaar items and payment options |
| `verify` | ✅ Yes | Verify payment transactions |
| `settle` | ✅ Yes | Settle completed payments |

**Note:** Environment variables are only required when using the `verify` and `settle` endpoints. The `list` endpoint can be used without authentication to discover bazaar items.

## Quick Start

```typescript
// Option 1: Import the default facilitator config
// Works for list endpoint without credentials, or with CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables for verify/settle
import { facilitator } from "@coinbase/x402";

// Option 2: Create a facilitator config, passing in credentials directly
import { createFacilitatorConfig } from "@coinbase/x402";

const facilitator = createFacilitatorConfig("your-cdp-api-key-id", "your-cdp-api-key-secret"); // Pass in directly from preferred secret management

// Use the facilitator config in your x402 integration
```

## Integration Examples

### With Express Middleware

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";

const app = express();

// Requires CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables
// for payment verification and settlement
app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/protected": {
      price: "$0.10",
      network: "base-sepolia"
    }
  },
  facilitator // Use Coinbase's facilitator
));
```
