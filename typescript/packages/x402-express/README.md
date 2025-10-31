# @b3dotfun/anyspend-x402-express

AnySpend-enhanced Express middleware for the x402 Payment Protocol. This package extends the standard x402-express middleware with multi-token and cross-chain payment support through the AnySpend facilitator.

## Installation

```bash
npm install @b3dotfun/anyspend-x402-express
```

## Quick Start

```typescript
import express from "express";
import { paymentMiddleware } from "@b3dotfun/anyspend-x402-express";
import { facilitator } from "@b3dotfun/anyspend-x402";

const app = express();

// Configure the payment middleware with AnySpend facilitator
app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/protected-route": {
      price: "$0.10",
      network: "base-sepolia",
      config: {
        description: "Access to premium content",
      }
    }
  },
  facilitator  // Use AnySpend facilitator for multi-token support
));

// Implement your route
app.get("/protected-route",
  (req, res) => {
    res.json({ message: "This content is behind a paywall" });
  }
);

app.listen(3000);
```

## What Makes AnySpend Different?

Unlike standard x402 implementations, AnySpend x402 enables:

- ✨ **Multi-token payments** - Accept payments in various ERC-20 tokens, not just USDC
- 🌉 **Cross-chain payments** - Users pay on one network, you receive on another
- 🔄 **Automatic conversion** - Token swaps and bridging handled seamlessly by the facilitator
- 🎯 **Standard compatibility** - Works with standard x402 clients (no custom client code needed)

## Configuration

The `paymentMiddleware` function accepts four parameters:

1. `payTo`: Your receiving address (`0x${string}`)
2. `routes`: Route configurations for protected endpoints
3. `facilitator`: Configuration for the x402 facilitator service (use AnySpend's for multi-token support)
4. `paywall`: (Optional) Configuration for the built-in paywall

### Using AnySpend Facilitator

```typescript
import { facilitator } from "@b3dotfun/anyspend-x402";
import { paymentMiddleware } from "@b3dotfun/anyspend-x402-express";

app.use(paymentMiddleware(
  "0xYourAddress",
  routes,
  facilitator  // Pre-configured AnySpend facilitator
));
```

## Middleware Options

### Route Configuration

```typescript
type RoutesConfig = Record<string, Price | RouteConfig>;

interface RouteConfig {
  price: Price;           // Price in USD or token amount
  network: Network;       // Supported networks (base, ethereum, arbitrum, etc.)
  config?: PaymentMiddlewareConfig;
}
```

### Payment Configuration

```typescript
interface PaymentMiddlewareConfig {
  description?: string;               // Description of the payment
  mimeType?: string;                  // MIME type of the resource
  maxTimeoutSeconds?: number;         // Maximum time for payment (default: 60)
  outputSchema?: Record<string, any>; // JSON schema for the response
  customPaywallHtml?: string;         // Custom HTML for the paywall
  resource?: string;                  // Resource URL (defaults to request URL)
}
```

### Facilitator Configuration

```typescript
type FacilitatorConfig = {
  url: string;                        // URL of the x402 facilitator service
  createAuthHeaders?: CreateHeaders;  // Optional function to create authentication headers
};
```

### Paywall Configuration

```typescript
type PaywallConfig = {
  cdpClientKey?: string;              // Your CDP Client API Key
  appName?: string;                   // Name displayed in the paywall wallet selection modal
  appLogo?: string;                   // Logo for the paywall wallet selection modal
  sessionTokenEndpoint?: string;      // API endpoint for Coinbase Onramp session authentication
};
```

## Supported Networks

AnySpend facilitator supports multiple networks:

- Base / Base Sepolia
- Ethereum / Ethereum Sepolia
- Arbitrum / Arbitrum Sepolia
- Optimism / Optimism Sepolia
- Polygon / Polygon Amoy

**Primary Settlement Token**: USDC across all supported networks

For the latest list of supported tokens and networks, query: `https://mainnet.anyspend.com/x402/supported`

## Optional: Coinbase Onramp Integration

**Note**: Onramp integration is completely optional. Your x402 paywall will work perfectly without it. This feature provides an easy way for customers to fund their wallets directly from the paywall.

When configured, a "Get more USDC" button will appear in your paywall, allowing users to purchase USDC directly through Coinbase Onramp.

### Quick Setup

#### 1. Create the Session Token Route

Add a session token endpoint to your Express app:

```typescript
import express from "express";
import { POST } from "@b3dotfun/anyspend-x402-express/session-token";

const app = express();

// Add the session token endpoint
app.post("/api/x402/session-token", POST);
```

#### 2. Configure Your Middleware

Add `sessionTokenEndpoint` to your middleware configuration:

```typescript
import { facilitator } from "@b3dotfun/anyspend-x402";

app.use(paymentMiddleware(
  payTo,
  routes,
  facilitator,
  {
    sessionTokenEndpoint: "/api/x402/session-token",
    cdpClientKey: "your-cdp-client-key",
  }
));
```

**Important**: The `sessionTokenEndpoint` must match the route you created above.

#### 3. Get CDP API Keys

1. Go to [CDP Portal](https://portal.cdp.coinbase.com/)
2. Navigate to your project's **[API Keys](https://portal.cdp.coinbase.com/projects/api-keys)**
3. Click **Create API key**
4. Download and securely store your API key

#### 4. Enable Onramp Secure Initialization

1. Go to [CDP Portal](https://portal.cdp.coinbase.com/)
2. Navigate to **Payments → [Onramp & Offramp](https://portal.cdp.coinbase.com/products/onramp)**
3. Toggle **"Enforce secure initialization"** to **Enabled**

#### 5. Set Environment Variables

```bash
# .env
CDP_API_KEY_ID=your_secret_api_key_id_here
CDP_API_KEY_SECRET=your_secret_api_key_secret_here
```

### How Onramp Works

Once set up, your x402 paywall will automatically show a "Get more USDC" button when users need to fund their wallets.

1. **Generates session token**: Your backend securely creates a session token using CDP's API
2. **Opens secure onramp**: User is redirected to Coinbase Onramp with the session token
3. **No exposed data**: Wallet addresses and app IDs are never exposed in URLs

### Troubleshooting Onramp

#### Common Issues

1. **"Missing CDP API credentials"**
    - Ensure `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` are set
    - Verify you're using **Secret API Keys**, not Client API Keys

2. **"Failed to generate session token"**
    - Check your CDP Secret API key has proper permissions
    - Verify your project has Onramp enabled

3. **API route not found**
    - Ensure you've added the session token route: `app.post("/your-path", POST)`
    - Check that your route path matches your `sessionTokenEndpoint` configuration
    - Verify the import: `import { POST } from "@b3dotfun/anyspend-x402-express/session-token"`

## Related Packages

- [@b3dotfun/anyspend-x402](https://www.npmjs.com/package/@b3dotfun/anyspend-x402) - AnySpend facilitator configuration
- [x402](https://www.npmjs.com/package/x402) - Core x402 protocol implementation
- [x402-express](https://www.npmjs.com/package/x402-express) - Standard Coinbase x402 Express middleware
- [x402-hono](https://www.npmjs.com/package/x402-hono) - Hono middleware
- [x402-next](https://www.npmjs.com/package/x402-next) - Next.js middleware
- [x402-fetch](https://www.npmjs.com/package/x402-fetch) - Client for Fetch API
- [x402-axios](https://www.npmjs.com/package/x402-axios) - Client for Axios

## About x402

The x402 protocol is an open standard for HTTP-native payments. It enables:

- **Low fees**: No percentage-based fees, just network costs
- **Instant settlement**: ~2 second finality on supported networks
- **Micro-payments**: Accept payments as low as $0.001
- **Chain agnostic**: Works across multiple blockchain networks
- **Easy integration**: One line of code for servers, one function for clients

Learn more at [x402.org](https://x402.org)

## Resources

- [x402 Protocol](https://x402.org)
- [AnySpend GitHub](https://github.com/b3-fun/anyspend-x402)
- [AnySpend Facilitator](https://mainnet.anyspend.com/x402)
- [CDP Documentation](https://docs.cdp.coinbase.com)
- [CDP Discord](https://discord.com/invite/cdp)

## License

Apache-2.0

## Contributing

Contributions are welcome! This is an extended version of the Coinbase x402-express middleware with AnySpend ecosystem integration.
