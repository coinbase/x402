# Gin Server Example

This example demonstrates how to integrate x402 payment middleware with a [Gin](https://gin-gonic.com/) web application to protect API endpoints with micropayments.

## What This Example Shows

- Setting up a Gin server with x402 payment middleware
- Protecting specific routes with payment requirements
- Configuring payment schemes (EVM exact scheme)
- Handling both protected and public endpoints

## Prerequisites

- Go 1.21 or higher
- An Ethereum address to receive payments (testnet recommended for development)
- Access to an x402 facilitator (e.g., `https://facilitator.x402.org`)

## Setup

1. **Install dependencies:**

```bash
go mod download
```

2. **Configure environment variables:**

Create a `.env` file in this directory with the following variables:

```bash
# Your Ethereum address to receive payments
EVM_PAYEE_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Facilitator URL for payment verification
FACILITATOR_URL=https://facilitator.x402.org

# Optional: Server port (defaults to 4021)
PORT=4021
```

## Running the Server

```bash
go run main.go
```

The server will start on `http://localhost:4021` (or your configured PORT).

## Testing the Endpoints

### Health Check (No Payment Required)

```bash
curl http://localhost:4021/health
```

Response:
```json
{
  "status": "ok",
  "version": "2.0.0"
}
```

### Weather Endpoint (Payment Required)

When you access the `/weather` endpoint without payment, you'll receive a 402 Payment Required response with payment details:

```bash
curl http://localhost:4021/weather
```

Response (402 Payment Required):
```json
{
  "accepts": {
    "scheme": "exact",
    "network": "eip155:84532",
    "price": "$0.001",
    "payTo": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
  },
  "description": "Get weather data for a city",
  "mimeType": "application/json"
}
```

To successfully access this endpoint, you need to use an x402-compatible client that can create and sign payments. See the [client examples](../../clients/) for how to make paid requests.

## How It Works

1. **Middleware Configuration**: The x402 payment middleware is registered with Gin using `ginmw.X402Payment()`
2. **Route Protection**: Routes are configured with payment requirements (scheme, price, network, payTo)
3. **Payment Verification**: When a request arrives with payment headers, the middleware verifies the payment with the facilitator
4. **Payment Settlement**: After verification, the payment is settled on-chain
5. **Request Processing**: Only after successful payment settlement does the request reach your handler

## Key Concepts

### Payment Schemes

This example uses the `exact` scheme, which requires an exact payment amount ($0.001 USDC) to access the protected resource.

### Networks

The example uses `eip155:84532` (Base Sepolia testnet). You can configure different networks by:
- Using other EVM networks (e.g., `eip155:1` for Ethereum mainnet)
- Adding SVM support for Solana (see advanced examples)

### Middleware Configuration

```go
r.Use(ginmw.X402Payment(ginmw.Config{
    Routes:      routes,           // Payment requirements per route
    Facilitator: facilitatorClient,// Client for payment verification
    Schemes:     schemes,          // Supported payment schemes
    Initialize:  true,             // Initialize on startup
    Timeout:     30 * time.Second, // Payment verification timeout
}))
```

## Next Steps

- **[Custom Server Example](../custom/)**: Learn how to implement x402 without middleware
- **[Advanced Examples](../advanced/)**: Explore dynamic pricing, hooks, and extensions
- **[Client Examples](../../clients/)**: Build clients that can make paid requests to this server

## Related Resources

- [Gin Documentation](https://gin-gonic.com/docs/)
- [x402 Protocol Specification](../../../../specs/)
- [x402 Go Package Documentation](../../../../go/)

