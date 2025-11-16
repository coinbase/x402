# x402-koa

x402 Payment Protocol implementation for Koa applications.

## Installation

```bash
npm install x402-koa
```

## Usage

### Basic Setup

```typescript
import Koa from 'koa';
import { paymentMiddleware } from 'x402-koa';

const app = new Koa();

// Simple configuration - All endpoints protected by $0.01 USDC on base-sepolia
app.use(paymentMiddleware(
  '0x123...', // payTo address
  {
    price: '$0.01', // USDC amount in dollars
    network: 'base-sepolia'
  }
));

app.use(async ctx => {
  ctx.body = { message: 'This endpoint requires payment!' };
});

app.listen(3000);
```

### Advanced Configuration

```typescript
import Koa from 'koa';
import Router from '@koa/router';
import { paymentMiddleware } from 'x402-koa';

const app = new Koa();
const router = new Router();

// Configure different payment requirements for different routes
app.use(paymentMiddleware(
  '0x123...', // payTo address
  {
    '/api/weather/*': {
      price: '$0.001',
      network: 'base',
      config: {
        description: 'Access to weather data'
      }
    },
    '/api/premium/*': {
      price: '$0.05',
      network: 'base',
      config: {
        description: 'Premium API access'
      }
    }
  },
  {
    // Optional custom facilitator
    url: 'https://facilitator.example.com',
    createAuthHeaders: async () => ({
      verify: { "Authorization": "Bearer token" },
      settle: { "Authorization": "Bearer token" }
    })
  },
  {
    // Optional paywall configuration
    cdpClientKey: 'your-cdp-client-key',
    appLogo: '/images/logo.svg',
    appName: 'My App',
    sessionTokenEndpoint: '/api/x402/session-token'
  }
));

router.get('/api/weather/current', async ctx => {
  ctx.body = { temperature: 72, condition: 'sunny' };
});

app.use(router.routes());
app.listen(3000);
```

### Session Token Endpoint

For Coinbase Onramp/Offramp integration:

```typescript
import Router from '@koa/router';
import { POST as sessionTokenHandler } from 'x402-koa/session-token';

const router = new Router();

// Add session token endpoint
router.post('/api/x402/session-token', sessionTokenHandler);
```

## Key Differences from x402-express

The x402-koa implementation leverages Koa's async/await capabilities for cleaner error handling and middleware flow:

1. **Async Middleware**: The middleware is fully async, eliminating callback patterns
2. **Context-based**: Uses Koa's context object instead of separate req/res objects
3. **Native async/await**: Settlement and verification happen naturally in the async flow

## API Reference

### `paymentMiddleware(payTo, routes, facilitator?, paywall?)`

Creates a Koa middleware for handling x402 payments.

- `payTo`: Address to receive payments (EVM or Solana)
- `routes`: Route configuration with payment requirements
- `facilitator`: Optional facilitator service configuration
- `paywall`: Optional paywall UI configuration

### `POST(ctx)`

Session token handler for Coinbase Onramp/Offramp.

Requires environment variables:
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

## License

Apache-2.0