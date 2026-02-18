# Fastify x402 Server Example

A comprehensive example demonstrating how to integrate x402 payment requirements with a Fastify web server. This example shows how to protect API endpoints behind micropayments using the x402 protocol.

## Features

- 🚀 **Fastify Integration**: Custom x402 plugin for Fastify framework
- 💰 **Payment Protection**: Endpoints requiring micropayments to access
- 🌐 **Multi-Network**: Support for Base Sepolia (EVM) and Solana Devnet
- 🔍 **Discovery**: Automatic `/.well-known/x402` discovery endpoint
- ⚡ **Performance**: Leverages Fastify's high-performance architecture
- 🛡️ **Error Handling**: Comprehensive error handling with proper status codes
- 📝 **TypeScript**: Full TypeScript support with proper typing

## Quick Start

### Prerequisites

- Node.js 18+
- EVM wallet address (for receiving payments)
- Solana wallet address (for receiving payments)

### Installation

```bash
# From the repository root
cd examples/typescript/servers/fastify
npm install
```

### Configuration

Copy the example environment file:

```bash
cp .env-local .env
```

Edit `.env` with your wallet addresses:

```env
EVM_ADDRESS=0xYourEvmWalletAddress
SVM_ADDRESS=YourSolanaWalletAddress
FACILITATOR_URL=https://facilitator.x402.org
PORT=4022
```

### Run the Server

```bash
npm run dev
```

The server will start at `http://localhost:4022`

## API Endpoints

### Payment-Protected Endpoints

#### `GET /weather`
Returns current weather data. Requires payment: $0.001

```bash
curl http://localhost:4022/weather
# Returns 402 Payment Required with payment instructions
```

**Response (402 Payment Required):**
```json
{
  "error": "Payment Required",
  "x402Version": "2",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "1000000000000000",
      "asset": "0x...",
      "payTo": "0xYourAddress"
    }
  ]
}
```

#### `GET /quote`
Returns daily inspirational quote. Requires payment: $0.005

```bash
curl http://localhost:4022/quote
# Returns 402 Payment Required with payment instructions
```

### Free Endpoints

#### `GET /`
API overview and documentation

#### `GET /health`
Server health check

#### `GET /.well-known/x402`
x402 discovery document for automated payment processing

## x402 Integration Architecture

### Custom Fastify Plugin

The example includes a custom x402 Fastify plugin (`src/x402-plugin.ts`) that:

1. **Registers Payment Schemes**: Supports EVM and Solana payment verification
2. **Provides Authentication**: `preHandler` hook for payment verification  
3. **Generates Payment Requirements**: Automatic 402 responses with payment instructions
4. **Discovery Endpoint**: Automatic `/.well-known/x402` route generation

### Usage Pattern

```typescript
// Register the plugin
await fastify.register(x402Plugin, {
  facilitatorUrl: 'https://facilitator.x402.org',
  resources: {
    'GET /endpoint': {
      accepts: [
        {
          scheme: 'exact',
          price: '$0.001',
          network: 'eip155:84532',
          payTo: evmAddress
        }
      ],
      description: 'Endpoint description'
    }
  }
});

// Protect a route
fastify.get('/endpoint', {
  preHandler: fastify.x402.authenticate
}, async () => {
  return { data: 'Protected content' };
});
```

## Payment Flow

1. **Client Request**: Client makes request to protected endpoint
2. **Payment Check**: Plugin checks for valid x402 payment headers
3. **Payment Required**: If no payment, returns 402 with payment requirements
4. **Client Payment**: Client processes payment using x402 client SDK
5. **Retry with Payment**: Client retries request with payment proof
6. **Access Granted**: Server validates payment and serves content

## Supported Networks

- **Base Sepolia**: `eip155:84532` (testnet)
- **Solana Devnet**: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`

## Making Payments

Use x402 client SDKs to make payments:

### TypeScript Client

```typescript
import { createX402Client } from '@x402/core';

const client = createX402Client({
  facilitatorUrl: 'https://facilitator.x402.org'
});

const response = await client.get('http://localhost:4022/weather');
```

### Python Client

```python
from x402 import Client

client = Client(facilitator_url='https://facilitator.x402.org')
response = client.get('http://localhost:4022/weather')
```

### cURL (Manual)

1. Get payment requirements:
```bash
curl -i http://localhost:4022/weather
```

2. Process payment using facilitator and payment proof

3. Retry with payment headers:
```bash
curl -H "x402-payment: <payment-proof>" http://localhost:4022/weather
```

## Development

### Scripts

```bash
npm run dev        # Start development server with hot reload
npm run build      # Build for production
npm run start      # Start production server
npm run format     # Format code with Prettier
npm run lint       # Lint code with ESLint
```

### Testing the Integration

```bash
# Test discovery endpoint
curl http://localhost:4022/.well-known/x402

# Test payment requirements
curl -i http://localhost:4022/weather

# Test free endpoints
curl http://localhost:4022/health
```

## Fastify vs Express

Key differences from the Express x402 integration:

| Feature | Express | Fastify |
|---------|---------|---------|
| Middleware | Global middleware | Plugin + preHandler hooks |
| Performance | Standard | High-performance, schema-based |
| TypeScript | Good support | Excellent built-in support |
| Ecosystem | Mature | Modern, growing |
| Plugin System | Middleware-based | Encapsulated plugin architecture |

## Production Considerations

### Environment Variables

```env
NODE_ENV=production
FACILITATOR_URL=https://facilitator.x402.org
EVM_ADDRESS=0xYourProductionAddress
SVM_ADDRESS=YourProductionSolanaAddress
PORT=3000
HOST=0.0.0.0
```

### Security

- Use HTTPS in production
- Validate all input parameters
- Implement rate limiting
- Monitor payment verification failures
- Set up proper logging and monitoring

### Scaling

- Enable Fastify's built-in clustering
- Use Redis for session storage if needed
- Implement caching for payment verification
- Monitor performance with Fastify's built-in metrics

## Resources

- [Fastify Documentation](https://fastify.dev/)
- [x402 Protocol Specification](https://github.com/coinbase/x402)
- [x402 TypeScript SDK](https://www.npmjs.com/package/@x402/core)
- [Other x402 Examples](../README.md)

## License

This example is part of the x402 project and is available under the same license terms.