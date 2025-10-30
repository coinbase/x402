# @b3-fun/anyspend-x402

AnySpend implementation of the x402 Payment Protocol. This package provides facilitator access for the x402 protocol, enabling payment verification and settlement.

Based on the original [@coinbase/x402](https://www.npmjs.com/package/@coinbase/x402) package with extended functionality.

## Installation

```bash
npm install @b3-fun/anyspend-x402
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
import { facilitator } from "@b3-fun/anyspend-x402";

// Option 2: Create a facilitator config, passing in credentials directly
import { createFacilitatorConfig } from "@b3-fun/anyspend-x402";

const facilitator = createFacilitatorConfig("your-cdp-api-key-id", "your-cdp-api-key-secret"); // Pass in directly from preferred secret management

// Use the facilitator config in your x402 integration
```

## Integration Examples

### With Express Middleware

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@b3-fun/anyspend-x402";

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

### With Hono

```typescript
import { Hono } from "hono";
import { paymentMiddleware } from "x402-hono";
import { facilitator } from "@b3-fun/anyspend-x402";

const app = new Hono();

app.use("*", paymentMiddleware(
  "0xYourAddress",
  {
    "/api/*": {
      price: "$0.01",
      network: "base-sepolia"
    }
  },
  facilitator
));
```

### With Next.js

```typescript
import { paymentMiddleware } from "x402-next";
import { facilitator } from "@b3-fun/anyspend-x402";

export default paymentMiddleware(
  handler,
  "0xYourAddress",
  { price: "$0.05", network: "base-sepolia" },
  facilitator
);
```

## API Reference

### `facilitator`

Pre-configured facilitator instance using Coinbase's hosted service at `https://mainnet.anyspend.com/x402`. Reads credentials from environment variables if available.

```typescript
import { facilitator } from "@b3-fun/anyspend-x402";

// Facilitator is configured to use:
// - URL: https://mainnet.anyspend.com/x402
// - Credentials: CDP_API_KEY_ID and CDP_API_KEY_SECRET from environment
```

### `createFacilitatorConfig(apiKeyId?, apiKeySecret?)`

Creates a custom facilitator configuration.

**Parameters:**
- `apiKeyId` (optional): Your CDP API key ID. Falls back to `CDP_API_KEY_ID` env var
- `apiKeySecret` (optional): Your CDP API key secret. Falls back to `CDP_API_KEY_SECRET` env var

**Returns:** `FacilitatorConfig` object compatible with x402 middleware

```typescript
import { createFacilitatorConfig } from "@b3-fun/anyspend-x402";

const customFacilitator = createFacilitatorConfig(
  process.env.MY_CDP_KEY_ID,
  process.env.MY_CDP_KEY_SECRET
);
```

### `createAuthHeader(apiKeyId, apiKeySecret, requestMethod, requestHost, requestPath)`

Creates an authorization header for Coinbase API requests.

**Parameters:**
- `apiKeyId`: The API key ID
- `apiKeySecret`: The API key secret
- `requestMethod`: HTTP method (e.g., 'POST', 'GET')
- `requestHost`: Request host (e.g., 'api.cdp.coinbase.com')
- `requestPath`: Request path (e.g., '/platform/v2/x402/verify')

**Returns:** Promise<string> - The authorization header string

### `createCorrelationHeader()`

Creates a correlation header for tracking requests.

**Returns:** string - The correlation header string

## About x402

The x402 protocol is an open standard for HTTP-native payments. It enables:

- **Low fees**: No percentage-based fees, just network costs
- **Instant settlement**: ~2 second finality on supported networks
- **Micro-payments**: Accept payments as low as $0.001
- **Chain agnostic**: Works across multiple blockchain networks
- **Easy integration**: One line of code for servers, one function for clients

Learn more at [x402.org](https://x402.org)

## Related Packages

- [x402](https://www.npmjs.com/package/x402) - Core x402 protocol implementation
- [x402-express](https://www.npmjs.com/package/x402-express) - Express.js middleware
- [x402-hono](https://www.npmjs.com/package/x402-hono) - Hono middleware
- [x402-next](https://www.npmjs.com/package/x402-next) - Next.js middleware
- [x402-fetch](https://www.npmjs.com/package/x402-fetch) - Client for Fetch API
- [x402-axios](https://www.npmjs.com/package/x402-axios) - Client for Axios

## Contributing

Contributions are welcome! This is a fork of the original Coinbase x402 implementation with extensions for the AnySpend ecosystem.

## License

Apache-2.0

## Support

- Documentation: [x402.org/docs](https://x402.org/docs)
- GitHub: [b3-fun/anyspend-x402](https://github.com/b3-fun/anyspend-x402)
- Issues: [Report bugs](https://github.com/b3-fun/anyspend-x402/issues)
