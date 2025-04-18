# x402-next Example App

This is a Next.js application that demonstrates how to use the `x402-next` middleware to implement paywall functionality in your Next.js routes.

## Prerequisites

- Node.js (20 or higher)
- A valid x402 facilitator URL (you can run the example facilitator at `examples/typescript/facilitator`)
- A valid Ethereum address for receiving payments

## Setup

1. First, start the local facilitator server:
```bash
cd ../facilitator
# Ensure .env is setup
pnpm install
pnpm dev
```
The facilitator will run on http://localhost:3002

2. In a new terminal, install and start the Next.js example:
```bash
pnpm install
pnpm dev
```
The Next.js app will run on http://localhost:3000

3. Create a `.env.local` file in the Next.js project directory with the following variables:
```env
NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3002
RESOURCE_WALLET_ADDRESS=0xYourEthereumAddress
NETWORK=base # or "base-sepolia" for testnet
```

## Example Routes

The app includes protected routes that require payment to access:

### Protected Page Route
The `/protected` route requires a payment of $0.01 to access. The route is protected using the x402-next middleware:

```typescript
// middleware.ts
import { createPaymentMiddleware, Network } from "x402-next";

export const middleware = createPaymentMiddleware({
  facilitatorUrl: process.env.NEXT_PUBLIC_FACILITATOR_URL,
  address: process.env.RESOURCE_WALLET_ADDRESS,
  network: process.env.NETWORK as Network,
  routes: {
    "/protected": {
      amount: "$0.01",
      config: {
        description: "Access to protected content"
      }
    },
  }
});

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    "/protected/:path*",
  ]
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
export const middleware = createPaymentMiddleware({
  facilitatorUrl: process.env.NEXT_PUBLIC_FACILITATOR_URL,
  address: process.env.RESOURCE_WALLET_ADDRESS,
  network: process.env.NETWORK as Network,
  routes: {
    "/protected": {
      amount: "$0.01",
      config: {
        description: "Access to protected content"
      }
    },
    "/api/premium": {
      amount: "$0.10",
      config: {
        description: "Premium API access"
      }
    }
  }
});

export const config = {
  matcher: [
    "/protected/:path*",
    "/api/premium/:path*"
  ]
};
```
