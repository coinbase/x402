# x402-next Example App

This is a Next.js application that demonstrates how to use the `x402-next` middleware to implement paywall functionality in your Next.js routes.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A valid Ethereum address for receiving payments

## Setup

1. Copy `.env-local` to `.env` and add your Ethereum address to receive payments:

```bash
cp .env-local .env
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
The `/protected` route requires a payment of $0.01 to access. The page route is protected using the x402-next middleware:

```typescript
// middleware.ts
import { paymentMiddleware, Network, Resource } from "x402-next";

const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL as Resource;
const payTo = process.env.RESOURCE_WALLET_ADDRESS as Address;
const network = process.env.NETWORK as Network;

export const middleware = paymentMiddleware(
  payTo,
  {
    "/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Access to protected content",
      },
    },
  },
  {
    url: facilitatorUrl,
  },
);

// Configure which paths the middleware should run on
export const config = {
  matcher: ["/protected/:path*"],
  runtime: "nodejs",
};
```

### Protected API Route
The `/api/weather` API route requires a payment of $0.01 to access. The API route is protected using the x402-next route wrapper. This is the recommened approach to protect API routes as it guarantees payment settlement only AFTER successful API responses (status < 400). API routes can also be protected by the x402-next middleware, however this will charge clients for failed API responses.

```typescript
// app/api/weather/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withX402, Network, Resource } from "x402-next";

const handler = async (_: NextRequest) => {
  return NextResponse.json({
    report: { weather: "sunny", temperature: 70 }
  });
};

export const GET = withX402(
  handler,
  payTo,
  {
    price: "$0.01",
    network,
    config: { description: "Access to weather API" }
  },
  { url: facilitatorUrl },
  { appName: "Next x402 Demo", appLogo: "/x402-icon-blue.png" }
);
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
      price: "$0.01",
      network,
      config: {
        description: "Access to protected content",
      },
    },
    "/api/premium": {
      price: "$0.10",
      network,
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
