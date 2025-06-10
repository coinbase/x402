# x402-next Example App

This is a Next.js application that demonstrates how to use the `x402-next` middleware to implement paywall functionality in your Next.js routes.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A valid Ethereum address for receiving payments

## Setup

1. Copy `.env.local` to `.env` and add your Ethereum address to receive payments:

```bash
cp .env.local .env
```

2. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd fullstack/next
```

2. Install and start the Next.js example:
```bash
pnpm dev
```

## Example Routes

The app includes protected routes that require payment to access:

### Protected Page Route
The `/protected` route requires a payment of $0.001 to access. The route is protected using the x402-next middleware:

```typescript
// middleware.ts
import { paymentMiddleware, Network, Resource } from "x402-next";
import { facilitator } from "@coinbase/x402";

const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;

export const middleware = paymentMiddleware(
  payTo,
  {
    "/protected": {
      price: "$0.001",
      network: "base",
      config: {
        description: "Access to protected content",
      },
    },
  },
  facilitator
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/protected/:path*"],
  runtime: "nodejs",
};
```

## Response Format

### Payment Required (402)
```json
{
  "error": "X-PAYMENT header is required",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "1000",
    "resource": "http://localhost:3000/protected",
    "description": "Access to protected content",
    "mimeType": "",
    "payTo": "0xYourAddress",
    "maxTimeoutSeconds": 60,
    "asset": "0x...",
    "outputSchema": null,
    "extra": null
  }
}
```

### Successful Response
```ts
// Headers
{
  "X-PAYMENT-RESPONSE": "..." // Encoded response object
}
```

## Extending the Example

To add more protected routes, update the middleware configuration:

```typescript
export const middleware = paymentMiddleware(
  payTo,
  {
    "/protected": {
      price: "$0.001",
      network: "base",
      config: {
        description: "Access to protected content",
      },
    },
    "/api/premium": {
      price: "$0.01",
      network: "base",
      config: {
        description: "Premium API access",
      },
    },
  }
);

export const config = {
  matcher: ["/protected/:path*", "/api/premium/:path*"],
  runtime: "nodejs",
};
```

## Accessing Mainnet

To access the mainnet facilitator in NextJs, a temporary workaround is currently needed. The `@coinbase/x402` package currently only supports Node.js runtimes and is incompatible with the Edge runtime. Coinbase is actively working on Edge runtime compatibility.

As a **temporary solution** until official support is available, you can enable the Node.js runtime for middleware:

1. Enable Node middleware as an experimental feature:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // rest of your next config setup
  experimental: {
    nodeMiddleware: true,
  }
};
```

2. Specify the Node.js runtime in your middleware:

```ts
// middleware.ts
export const config = {
  // rest of your config setup
  runtime: 'nodejs',
};
```

3. Use the `canary` version of Next.js to access experimental features:

```json
// package.json
{
  "dependencies": {
    "next": "canary",
  }
}
```

**Note:** This approach is only needed temporarily while awaiting official Edge runtime support in the x402 package.