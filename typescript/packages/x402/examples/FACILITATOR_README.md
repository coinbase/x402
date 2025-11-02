# Starknet x402 Facilitator Deployment Guide

## Overview

The Starknet x402 Facilitator is a production-ready server that handles payment verifications and settlements for the x402 protocol on Starknet. It provides REST API endpoints compatible with the standard x402 facilitator interface.

## Features

- ✅ Full x402 protocol support for Starknet
- ✅ Account abstraction and session keys
- ✅ Rate limiting and security features
- ✅ Docker support for easy deployment
- ✅ Health monitoring and metrics
- ✅ Production-ready with proper error handling

## Quick Start

### Prerequisites

- Node.js 20+ or Docker
- A Starknet account with private key
- Access to a Starknet RPC endpoint (optional)

### Local Development

1. **Clone and install dependencies:**
```bash
cd typescript/packages/x402
npm install
```

2. **Configure environment:**
```bash
cp examples/.env.example examples/.env
# Edit .env with your configuration
```

3. **Run the facilitator:**
```bash
npx ts-node examples/starknet-facilitator-server.ts
```

### Docker Deployment

1. **Using Docker Compose (recommended):**
```bash
cd typescript/packages/x402/examples
docker-compose up -d
```

2. **Using Docker directly:**
```bash
cd typescript/packages/x402
docker build -f examples/Dockerfile.facilitator -t x402-facilitator .
docker run -p 3000:3000 --env-file examples/.env x402-facilitator
```

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `FACILITATOR_PRIVATE_KEY` | Private key of facilitator account | `0x1234...` |
| `FACILITATOR_ADDRESS` | Address of facilitator account | `0xabcd...` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `STARKNET_NETWORK` | Network to use | `starknet-sepolia` |
| `STARKNET_RPC_URL` | Custom RPC endpoint | Network default |
| `MAX_AMOUNT_PER_DAY` | Daily amount limit | `1000000000` |
| `MAX_TRANSACTIONS_PER_DAY` | Daily transaction limit | `100` |
| `ENABLE_RATE_LIMITING` | Enable rate limiting | `true` |
| `ENABLE_SESSION_KEYS` | Enable session keys | `true` |
| `CORS_ORIGIN` | CORS allowed origins | `*` |

## API Endpoints

### Core Endpoints

#### `POST /api/verify`
Verify a payment authorization.

**Request:**
```json
{
  "paymentPayload": {
    "scheme": "starknet-native",
    "network": "starknet-sepolia",
    "payload": {
      "authorization": {
        "from": "0xAccountAddress",
        "to": "0xRecipientAddress",
        "amount": "1000000",
        "tokenAddress": "0xUSDCAddress",
        "nonce": "1",
        "deadline": "1234567890"
      },
      "signature": ["0xR", "0xS"]
    }
  },
  "paymentRequirements": {
    "scheme": "starknet-native",
    "network": "starknet-sepolia",
    "payTo": "0xRecipientAddress",
    "maxAmountRequired": "1000000",
    "asset": "0xUSDCAddress"
  }
}
```

**Response:**
```json
{
  "isValid": true,
  "payer": "0xAccountAddress"
}
```

#### `POST /api/settle`
Execute a verified payment.

**Request:** Same as verify endpoint

**Response:**
```json
{
  "success": true,
  "payer": "0xAccountAddress",
  "transaction": "0xTransactionHash",
  "network": "starknet-sepolia"
}
```

#### `GET /api/status/:txHash`
Check transaction status.

**Response:**
```json
{
  "status": "ACCEPTED_ON_L2",
  "blockNumber": 12345,
  "transactionHash": "0xTransactionHash"
}
```

#### `GET /api/nonce/:account`
Get next nonce for an account.

**Response:**
```json
{
  "nonce": "42"
}
```

#### `POST /api/session-key`
Create a session key for delegated payments.

**Request:**
```json
{
  "publicKey": "0xPublicKey",
  "expiresAt": 1234567890,
  "maxAmountPerTx": "1000000",
  "maxTotalAmount": "10000000",
  "allowedRecipients": ["0xRecipient"],
  "allowedTokens": ["0xUSDC"]
}
```

### Utility Endpoints

- `GET /health` - Health check
- `GET /api` - API documentation
- `GET /api/requirements` - Get payment requirements
- `GET /api/example` - Example request

## Production Deployment

### 1. Security Considerations

- **Never commit private keys** to version control
- Use environment variables or secrets management
- Enable rate limiting in production
- Use HTTPS with proper certificates
- Implement request signing/authentication
- Set specific CORS origins

### 2. High Availability Setup

```yaml
# docker-compose-ha.yml
version: '3.8'

services:
  facilitator1:
    extends:
      file: docker-compose.yml
      service: facilitator
    environment:
      - INSTANCE_ID=1

  facilitator2:
    extends:
      file: docker-compose.yml
      service: facilitator
    environment:
      - INSTANCE_ID=2

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - facilitator1
      - facilitator2
```

### 3. Monitoring

The facilitator includes health check endpoints and can be integrated with:
- Prometheus for metrics collection
- Grafana for visualization
- Sentry for error tracking
- CloudWatch/Datadog for cloud monitoring

### 4. Scaling

For high-volume deployments:

1. **Horizontal Scaling:** Run multiple facilitator instances behind a load balancer
2. **Database:** Use PostgreSQL for persistent state across instances
3. **Caching:** Use Redis for distributed rate limiting and session management
4. **Queue:** Implement a message queue for async processing

## Testing

### Unit Tests
```bash
npm test -- facilitator.test.ts
```

### Integration Tests
```bash
# Start test server
NODE_ENV=test npm run facilitator:test

# Run integration tests
npm run test:integration
```

### Load Testing
```bash
# Using Apache Bench
ab -n 1000 -c 10 -T application/json -p verify-payload.json http://localhost:3000/api/verify

# Using k6
k6 run load-test.js
```

## Troubleshooting

### Common Issues

1. **"FACILITATOR_PRIVATE_KEY is required"**
   - Set the environment variable with your Starknet account private key

2. **"Failed to connect to Starknet"**
   - Check network configuration
   - Verify RPC endpoint is accessible
   - Ensure correct network (mainnet/sepolia)

3. **"Rate limit exceeded"**
   - Adjust `MAX_AMOUNT_PER_DAY` and `MAX_TRANSACTIONS_PER_DAY`
   - Implement Redis for distributed rate limiting

4. **"Invalid signature"**
   - Verify the account contract supports x402
   - Check signature format and encoding
   - Ensure correct message hash calculation

### Logs

Check logs for debugging:
```bash
# Docker logs
docker-compose logs -f facilitator

# PM2 logs (if using PM2)
pm2 logs facilitator

# System logs
journalctl -u x402-facilitator
```

## Support

For issues or questions:
- Open an issue on GitHub
- Check the x402 documentation
- Contact the development team

## License

This facilitator implementation is provided as-is for the x402 protocol on Starknet.