# @x402/express

Express middleware integration for the x402 Payment Protocol. This package provides a simple middleware function for adding x402 payment requirements to your Express.js applications.

## Installation

```bash
npm install @x402/express
```

## Quick Start

```typescript
import express from "express";
import { paymentMiddleware } from "@x402/express";

const app = express();

// Apply the payment middleware with your configuration
app.use(paymentMiddleware(
  {
    "/protected-route": {
      price: "$0.10",
      network: "base-sepolia",
      config: {
        description: "Access to premium content",
      }
    }
  },
  // Optional: custom facilitator client
  undefined,
  // Optional: paywall configuration
  {
    cdpClientKey: "your-cdp-client-key",
    appName: "Your App",
    appLogo: "/logo.svg"
  }
));

// Implement your protected route
app.get("/protected-route", 
  (req, res) => {
    res.json({ message: "This content is behind a paywall" });
  }
);

app.listen(3000);
```

## Configuration

The `paymentMiddleware` function accepts three parameters:

```typescript
paymentMiddleware(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  paywallConfig?: PaywallConfig
)
```

### Parameters

1. **`routes`** (required): Route configurations for protected endpoints
2. **`facilitatorClients`** (optional): Custom facilitator client(s) for payment processing
3. **`paywallConfig`** (optional): Configuration for the built-in paywall UI

See the sections below for detailed configuration options.

## API Reference

### ExpressAdapter

The `ExpressAdapter` class implements the `HTTPAdapter` interface from `@x402/core`, providing Express-specific request handling:

```typescript
class ExpressAdapter implements HTTPAdapter {
  getHeader(name: string): string | undefined
  getMethod(): string
  getPath(): string
  getUrl(): string
  getAcceptHeader(): string
  getUserAgent(): string
}
```

### Middleware Function

```typescript
function paymentMiddleware(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  paywallConfig?: PaywallConfig
): (req: Request, res: Response, next: NextFunction) => Promise<void>
```

Creates Express middleware that:
1. Instantiates an x402HTTPResourceService with the provided configuration
2. Checks if the incoming request matches a protected route
3. Validates payment headers if required
4. Returns payment instructions (402 status) if payment is missing or invalid
5. Processes the request if payment is valid
6. Handles settlement after successful response

### Route Configuration

Routes are passed as the first parameter to `paymentMiddleware`:

```typescript
const routes: RoutesConfig = {
  "/api/protected": {
    price: "$0.10",
    network: "base-sepolia",
    config: {
      description: "Premium API access",
      maxTimeoutSeconds: 60
    }
  }
};

app.use(paymentMiddleware(routes));
```

### Paywall Configuration

The middleware automatically displays a paywall UI when browsers request protected endpoints. 

**Option 1: Full Paywall UI (Recommended)**

Install the optional `@x402/paywall` package for a complete wallet connection and payment UI:

```bash
pnpm add @x402/paywall
```

Then configure it:

```typescript
const paywallConfig: PaywallConfig = {
  cdpClientKey: "your-cdp-client-key",
  appName: "Your App Name",
  appLogo: "/path/to/logo.svg",
  sessionTokenEndpoint: "/api/x402/session-token",
  testnet: true
};

app.use(paymentMiddleware(routes, undefined, undefined, paywallConfig));
```

The paywall includes:
- EVM wallet support (MetaMask, Coinbase Wallet, etc.)
- Solana wallet support (Phantom, Solflare, etc.)
- USDC balance checking
- Chain switching
- Onramp integration for mainnet

**Option 2: Basic Paywall (No Installation)**

Without `@x402/paywall` installed, the middleware returns a basic HTML page with payment instructions. This works but doesn't include wallet connections.

**Option 3: Custom HTML**

Provide your own HTML template:

```typescript
app.use(paymentMiddleware(routes, undefined, undefined, paywallConfig, customHtml));
```

## Advanced Usage

### Multiple Protected Routes

```typescript
app.use(paymentMiddleware(
  {
    "/api/premium/*": {
      price: "$1.00",
      network: "base",
      config: {
        description: "Premium API access"
      }
    },
    "/api/data": {
      price: "$0.50",
      network: "base-sepolia",
      config: {
        description: "Data endpoint access",
        maxTimeoutSeconds: 120
      }
    }
  }
));
```

### Custom Facilitator Client

If you need to use a custom facilitator service, pass it as the second parameter:

```typescript
import { createFacilitatorClient } from "@x402/core";

const customFacilitator = createFacilitatorClient({
  url: "https://your-facilitator.com",
  createAuthHeaders: async () => ({
    verify: { "Authorization": "Bearer your-token" },
    settle: { "Authorization": "Bearer your-token" }
  })
});

app.use(paymentMiddleware(routes, customFacilitator, paywallConfig));
```


## Migration from x402-express

If you're migrating from the legacy `x402-express` package:

1. **Update imports**: Change from `x402-express` to `@x402/express`
2. **Simplified API**: The new `paymentMiddleware` function handles server instantiation internally
3. **Parameter order**: Routes are now the first parameter, followed by optional facilitator and paywall config

### Before (x402-express):
```typescript
import { paymentMiddleware } from "x402-express";

app.use(paymentMiddleware(
  payTo,           // First param was payTo address
  routes,          // Second param was routes
  facilitator,     // Third param was facilitator config
  paywall         // Fourth param was paywall config
));
```

### After (@x402/express):
```typescript
import { paymentMiddleware } from "@x402/express";

app.use(paymentMiddleware(
  routes,          // First param is now routes (payTo is part of route config)
  facilitator,     // Second param is facilitator client (optional)
  paywall         // Third param is paywall config (optional)
));
```

Note: The `payTo` address is now specified within each route configuration rather than as a separate parameter.

## Resources

- [x402 Protocol](https://x402.org)
- [x402 Core Documentation](https://github.com/your-org/x402/tree/main/typescript/packages/core)
- [CDP Documentation](https://docs.cdp.coinbase.com)
- [CDP Discord](https://discord.com/invite/cdp)
