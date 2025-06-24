# @coinbase/x402

The official Coinbase facilitator package for the x402 Payment Protocol. This package provides direct access to Coinbase's hosted facilitator service, enabling seamless payment verification and settlement.

## Installation

```bash
npm install @coinbase/x402
```

## Environment Variables

This package requires CDP API keys from the [Coinbase Developer Platform](https://www.coinbase.com/developer-platform):

- `CDP_API_KEY_ID`: Your CDP API key ID
- `CDP_API_KEY_SECRET`: Your CDP API key secret

You can optionally include a [CDP Client API Key](https://portal.cdp.coinbase.com/projects/api-keys/client-key) for the built-in paywall. For more on Paywall configuration options, check out the [paywall README](../x402/src/paywall/README.md).

## Quick Start

```typescript
// Option 1: Import the default facilitator config (assumes CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables)
import { facilitator } from "@coinbase/x402";

// Option 2: Create a custom facilitator config, passing in your credentials
import { createFacilitatorConfig } from "@coinbase/x402";

const facilitator = createFacilitatorConfig(
  "your-cdp-api-key-id",
  "your-cdp-api-key-secret"
);

// Use the facilitator config in your x402 integration
```

## Integration Examples

### With Express Middleware

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@coinbase/x402";

const app = express();

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
