# x402-hono

Hono middleware integration for the x402 Payment Protocol. This package allows you to easily add paywall functionality to your Hono applications using the x402 protocol.

## Installation

```bash
npm install x402-hono
```

## Quick Start

```typescript
import { Hono } from "hono";
import { configurePaymentMiddleware, Network } from "x402-hono";

const app = new Hono();

// Configure the payment middleware
const paymentMiddleware = configurePaymentMiddleware({
  facilitatorUrl: "https://your-facilitator-url.com",
  address: "0xYourAddress",
  network: "base" as Network, // or "base-sepolia" for testnet
});

// Apply the middleware to a route
app.get(
  "/protected-route",
  paymentMiddleware("$0.10", {
    description: "Access to premium content",
    resource: "https://your-api.com/protected-route"
  }),
  (c) => {
    return c.json({ message: "This content is behind a paywall" });
  }
);

serve({
  fetch: app.fetch,
  port: 3000
});
```

## Configuration

The `configurePaymentMiddleware` function accepts a global configuration object with the following properties:

```typescript
interface GlobalConfig {
  facilitatorUrl: string;  // URL of the x402 facilitator service
  address: `0x${string}`;  // Your receiving address
  network: Network;        // "base" or "base-sepolia"
}
```

## Middleware Options

When applying the middleware to a route, you can specify the following options:

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

- Payment verification and settlement
- Automatic paywall generation for web browsers
- Payment receipt in response header
- Customizable paywall HTML
- Seamless integration with Hono's middleware system
- Support for both API and web browser requests

## Error Handling

The middleware will return:
- 402 status code when payment is required
- 402 status code when payment verification fails
- 402 status code when settlement fails
