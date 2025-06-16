# x402-tinyhttp

tinyhttp middleware integration for the x402 Payment Protocol. This package allows you to easily add paywall functionality to your tinyhttp applications using the x402 protocol.

## Installation

```bash
npm install x402-tinyhttp
```

## Quick Start

```typescript
import { App } from '@tinyhttp/app';
import { paymentMiddleware, Network } from 'x402-tinyhttp';

const app = new App();

// Configure the payment middleware
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
  }
));

// Implement your route
app.get("/protected-route", (req, res) => {
  res.json({ message: "This content is behind a paywall" });
});

app.listen(3000);
```

## Configuration

The `paymentMiddleware` function accepts three parameters:

1. `payTo`: Your receiving address (`0x${string}`)
2. `routes`: Route configurations for protected endpoints
3. `facilitator`: (Optional) Configuration for the x402 facilitator service

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

### Price Types

```typescript
type Price = 
  | string                    // "$0.01" (USD amount)
  | number                    // 0.01 (USD amount)
  | {
      amount: string;         // Token amount in atomic units
      asset: {
        address: string;      // Token contract address
        decimals: number;     // Token decimals
        eip712: {
          name: string;       // Token name for EIP-712 signing
          version: string;    // Token version for EIP-712 signing
        };
      };
    };
```

### Network Types

```typescript
type Network = "base" | "base-sepolia";
```

## Advanced Usage

### Multiple Route Protection

```typescript
app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/api/weather": {
      price: "$0.001",
      network: "base-sepolia",
      config: {
        description: "Weather API access",
        mimeType: "application/json"
      }
    },
    "/api/premium/*": {
      price: "$0.05",
      network: "base-sepolia",
      config: {
        description: "Premium API access",
        maxTimeoutSeconds: 120
      }
    }
  }
));
```

### Custom Facilitator

```typescript
app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/protected": {
      price: "$0.01",
      network: "base"
    }
  },
  {
    url: "https://your-facilitator.com",
    createAuthHeaders: async () => ({
      verify: { "Authorization": "Bearer your-token" },
      settle: { "Authorization": "Bearer your-token" }
    })
  }
));
```

### Custom Paywall HTML

```typescript
app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/premium": {
      price: "$1.00",
      network: "base-sepolia",
      config: {
        customPaywallHtml: `
          <html>
            <body>
              <h1>Premium Content</h1>
              <p>Please pay $1.00 to access this content.</p>
            </body>
          </html>
        `
      }
    }
  }
));
```

## Error Handling

The middleware automatically handles various error scenarios:

- **Missing Payment**: Returns 402 status with payment requirements
- **Invalid Payment**: Returns 402 status with error details
- **Verification Failure**: Returns 402 status with failure reason
- **Settlement Failure**: Returns 402 status if settlement fails

## Browser Support

The middleware automatically detects browser requests and serves HTML paywall pages for better user experience. API requests receive JSON responses with payment requirements.

## TypeScript Support

This package is written in TypeScript and provides full type definitions for all configuration options and middleware functions.

## License

Apache-2.0

## Contributing

See the main [x402 repository](https://github.com/coinbase/x402) for contribution guidelines. 