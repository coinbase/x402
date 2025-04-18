# x402-next

Next.js middleware integration for the x402 Payment Protocol. This package allows you to easily add paywall functionality to your Next.js applications using the x402 protocol.

## Installation

```bash
npm install x402 x402-next
```

## Quick Start

1. Create a middleware file in your Next.js project (e.g., `middleware.ts`):

```typescript
import { createPaymentMiddleware, Network } from 'x402-next';

export const middleware = createPaymentMiddleware({
  facilitatorUrl: process.env.NEXT_PUBLIC_FACILITATOR_URL,
  address: process.env.RESOURCE_WALLET_ADDRESS,
  network: process.env.NETWORK as Network,
  routes: {
    '/protected': {
      amount: '$0.01',
      config: {
        description: 'Access to protected content'
      }
    },
  }
});

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    '/protected/:path*',
  ]
};
```

2. Set up your environment variables in `.env.local`:

```env
NEXT_PUBLIC_FACILITATOR_URL=https://your-facilitator-url.com
RESOURCE_WALLET_ADDRESS=0xYourAddress
NETWORK=base # or 'base-sepolia' for testnet
```

## Configuration

The `createPaymentMiddleware` function accepts a configuration object with the following properties:

```typescript
interface NextPaymentConfig {
  facilitatorUrl: string;  // URL of the x402 facilitator service
  address: string;         // Your receiving address
  network: Network;        // 'base' or 'base-sepolia'
  routes: {
    [pattern: string]: {
      amount: Money;       // Payment amount (e.g., '$0.01')
      config?: PaymentMiddlewareConfig;
    };
  };
}
```

## Middleware Options

Each route can be configured with the following options:

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

## Features

- Route-based payment protection
- Automatic paywall generation for web browsers
- Payment verification and settlement
- Payment receipt in response header
- Customizable paywall HTML
- Support for both API routes and page routes

## Error Handling

The middleware will return:
- 402 status code when payment is required
- 402 status code when payment verification fails
- 402 status code when settlement fails

