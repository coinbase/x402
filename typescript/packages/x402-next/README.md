# x402-next

Next.js middleware integration for the x402 Payment Protocol. This package allows you to easily add paywall functionality to your Next.js applications using the x402 protocol.

## Installation

```bash
npm install x402-next
```

## Quick Start

Create a middleware file in your Next.js project (e.g., `middleware.ts`):

```typescript
import { paymentMiddleware, Network } from 'x402-next';

export const middleware = paymentMiddleware(
  "0xYourAddress",
  {
    '/protected': {
      price: '$0.01',
      network: "base-sepolia",
      config: {
        description: 'Access to protected content'
      }
    },
  }
);

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/protected/:path*',
  ]
};
```

## Configuration

The `paymentMiddleware` function accepts three parameters:

1. `payTo`: Your receiving address (`0x${string}`)
2. `routes`: Route configurations for protected endpoints
3. `facilitator`: (Optional) Configuration for the x402 facilitator service
4. `paywall`: (Optional) Configuration for the built-in paywall

See the Middleware Options section below for detailed configuration options.

## Middleware Options

The middleware supports various configuration options:

### Route Configuration

```typescript
type RoutesConfig = Record<string, Price | RouteConfig>;

interface RouteConfig {
  price: Price;           // Price in USD or token amount
  network: Network;       // "base" or "base-sepolia"
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

For more on paywall configuration options, refer to the [paywall README](../x402/src/paywall/README.md).

```typescript
type PaywallConfig = {
  cdpClientKey?: string;              // Your CDP Client API Key
  appName?: string;                   // Name displayed in the paywall wallet selection modal
  appLogo?: string;                   // Logo for the paywall wallet selection modal
};
```

## Accessing Mainnet with @coinbase/x402

**TEMPORARY WORKAROUND**: The following configuration changes are only required until the `@coinbase/x402` package adds support for Edge runtime. Coinbase is actively working on making the package Edge-compatible, which will eliminate the need for these workarounds in the near future.

To use the official Coinbase facilitator package (`@coinbase/x402`) in your Next.js project, you'll need to make the following **temporary** changes to your project configuration:

1. Install the Coinbase facilitator package:

```bash
npm install @coinbase/x402
```

2. Enable Node.js middleware as an experimental feature in your Next.js config:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // rest of your next config setup
  experimental: {
    nodeMiddleware: true, // TEMPORARY: Only needed until Edge runtime support is added
  }
};

export default nextConfig;
```

3. Specify the Node.js runtime in your middleware file:

```ts
// middleware.ts
import { paymentMiddleware } from "x402-next";
import { facilitator } from "@coinbase/x402";

export const middleware = paymentMiddleware(
  "0xYourAddress",
  {
    "/protected": {
      price: "$0.01",
      network: "base",
      // other config options
    },
  },
  facilitator // Use the Coinbase facilitator
);

export const config = {
  matcher: ["/protected/:path*"],
  runtime: 'nodejs', // TEMPORARY: Only needed until Edge runtime support is added
};
```

4. Update your Next.js dependency to the canary version to access experimental features:

```json
// package.json
{
  "dependencies": {
    "next": "canary", // TEMPORARY: Only needed until Edge runtime support is added
    "x402-next": "^1.0.0",
    "@coinbase/x402": "^1.0.0"
    // other dependencies
  }
}
```

5. Set up your CDP API keys as environment variables:

```bash
# .env
CDP_API_KEY_ID=your-cdp-api-key-id
CDP_API_KEY_SECRET=your-cdp-api-key-secret

CDP_CLIENT_API_KEY=your-cdp-client-key # optional
```

**Important Note**: Once the `@coinbase/x402` package adds support for Edge runtime, you'll be able to use it directly without enforcing the nodejs runtime or requiring the canary version of next.