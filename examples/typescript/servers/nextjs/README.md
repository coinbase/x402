# Next.js x402 Server Example

This example demonstrates how to protect Next.js API routes with x402 payment requirements using the `@x402/next` middleware.

## Features Demonstrated

- **Basic Payment Protection** - Simple weather API with fixed pricing
- **Dynamic Pricing** - Code generation API with complexity-based pricing  
- **Multiple Networks** - Support for Base and Ethereum
- **TypeScript Integration** - Full type safety with Next.js API routes

## API Endpoints

### `GET /api/weather` ($0.01)
Returns current weather data and 3-day forecast.

```bash
# Discover payment requirements
curl http://localhost:3000/api/weather

# Pay and access (using awal CLI)
npx awal@latest x402 pay http://localhost:3000/api/weather
```

### `POST /api/generate-code` ($0.02-$0.10)
Generates code snippets with dynamic pricing based on complexity:
- Simple: $0.02
- Medium: $0.05  
- Complex: $0.10

```bash
# Discover requirements for complex generation
curl -X POST http://localhost:3000/api/generate-code \
  -H "Content-Type: application/json" \
  -d '{"language":"typescript","description":"fibonacci calculator","complexity":"complex"}'

# Pay and generate
npx awal@latest x402 pay http://localhost:3000/api/generate-code \
  -X POST \
  -d '{"language":"typescript","description":"fibonacci calculator","complexity":"complex"}' \
  --max-amount 100000
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create `.env.local`:

```bash
# Optional: Configure custom facilitator
# X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402

# Optional: Configure custom RPC endpoints
# EIP155_1_RPC_URL=https://eth.llamarpc.com
# EIP155_8453_RPC_URL=https://mainnet.base.org
```

### 3. Start Development Server

```bash
npm run dev
```

The server will start on [http://localhost:3000](http://localhost:3000).

## Implementation Details

### Basic Protection

```typescript
import { createPaymentHandler } from '@x402/next';

const handler = createPaymentHandler({
  accepts: [{
    scheme: 'exact',
    network: 'eip155:8453',
    price: '$0.01',
    payTo: '0x1234567890123456789012345678901234567890'
  }],
  description: 'Weather data and forecast'
}, async (req, res) => {
  // This only runs after payment verification
  res.json({ weather: 'sunny' });
});

export default handler;
```

### Dynamic Pricing

```typescript
const handler = createPaymentHandler({
  accepts: (req) => {
    const complexity = req.body?.complexity || 'simple';
    const prices = { simple: '$0.02', medium: '$0.05', complex: '$0.10' };
    
    return [{
      scheme: 'exact',
      network: 'eip155:8453',
      price: prices[complexity],
      payTo: '0x1234567890123456789012345678901234567890'
    }];
  }
}, async (req, res) => {
  // Handle request based on paid tier
});
```

## Testing with Clients

Use any x402 client to test your protected endpoints:

### Awal CLI
```bash
npx awal@latest x402 pay http://localhost:3000/api/weather
```

### Fetch Client
```typescript
import { createFetchClient } from '@x402/fetch';

const client = createFetchClient();
const response = await client.fetch('http://localhost:3000/api/weather');
```

## Next Steps

- Replace mock `payTo` addresses with your actual payment addresses
- Add error handling and logging
- Implement real business logic in your protected handlers
- Consider adding payment hooks for observability
- Deploy to Vercel or your preferred Next.js hosting platform

## Related Examples

- [`../express/`](../express/) - Express.js implementation
- [`../hono/`](../hono/) - Hono implementation  
- [`../advanced/`](../advanced/) - Advanced patterns and features