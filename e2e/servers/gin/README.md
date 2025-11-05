# Gin x402 v2 E2E Test Server

This is a Go Gin server implementation for x402 v2 protocol end-to-end testing.

## Overview

This server demonstrates how to integrate x402 v2 payment middleware with a Gin application. It uses the new v2 middleware from `go/http/gin/middleware.go` and provides a protected endpoint that requires payment.

## Features

- **x402 v2 Protocol Support**: Uses the latest v2 protocol specification
- **EVM Support**: Handles Ethereum Virtual Machine compatible payments (Base Sepolia)
- **Remote Facilitator**: Connects to an external facilitator service for payment processing
- **Payment Protection**: Protects endpoints with configurable payment requirements
- **Health Checks**: Provides health check endpoint for monitoring
- **Graceful Shutdown**: Supports graceful shutdown for testing

## Architecture

```
┌─────────────────┐
│     Client      │
└────────┬────────┘
         │ 1. GET /protected
         │
         ▼
┌─────────────────┐
│  Gin Middleware │ ◄──────┐
│   (x402 v2)     │        │ 3. Verify
└────────┬────────┘        │    payment
         │                 │
         │ 2. Request      │
         │    payment      │
         ▼                 │
┌─────────────────┐        │
│   Facilitator   │────────┘
│     Service     │
└─────────────────┘
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 4021)
- `EVM_PAYEE_ADDRESS`: Ethereum address to receive payments (required)
- `FACILITATOR_URL`: URL of the facilitator service (required)

### Endpoints

#### `GET /protected`
Protected endpoint requiring $0.001 USDC payment on Base Sepolia.

**Success Response (200)**:
```json
{
  "message": "Protected endpoint accessed successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### `GET /health`
Health check endpoint (no payment required).

**Response (200)**:
```json
{
  "status": "ok",
  "network": "eip155:84532",
  "payee": "0x...",
  "version": "2.0.0"
}
```

#### `POST /close`
Graceful shutdown endpoint for testing cleanup.

**Response (200)**:
```json
{
  "message": "Server shutting down gracefully"
}
```

## Running the Server

### Development

```bash
# Set environment variables
export PORT=4021
export EVM_PAYEE_ADDRESS=0x1234567890123456789012345678901234567890
export FACILITATOR_URL=http://localhost:4022

# Run the server
./run.sh
```

### Production

```bash
# Build
go build -o gin-server main.go

# Run
./gin-server
```

## Payment Flow

1. Client makes request to `/protected` without payment
2. Middleware returns 402 Payment Required with payment details
3. Client creates payment signature using facilitator
4. Client retries request with X-Payment header
5. Middleware verifies payment with facilitator
6. Server processes request and returns protected content
7. Server settles payment and returns X-Payment-Response header

## Testing

This server is designed for E2E testing and integrates with the test suite in `e2e/test.ts`.

To run the E2E tests:

```bash
cd ../..
pnpm test
```

To run with legacy servers:

```bash
pnpm test --legacy
```

## Differences from v1

The v2 implementation differs from v1 in several key ways:

1. **Network Format**: Uses CAIP-2 format (`eip155:84532`) instead of legacy strings (`base-sepolia`)
2. **Middleware API**: Uses new v2 middleware with different configuration structure
3. **Facilitator Integration**: Uses `HTTPFacilitatorClient` instead of legacy config
4. **Scheme Registration**: Explicitly registers EVM scheme service
5. **Type Safety**: Improved type safety with v2 types and interfaces

## Dependencies

- `github.com/coinbase/x402/go`: x402 v2 protocol implementation
- `github.com/gin-gonic/gin`: Gin web framework
- `github.com/joho/godotenv`: Environment variable loading

## Development Notes

- Server logs are minimal in release mode for cleaner E2E test output
- Graceful shutdown is handled via `/close` endpoint and OS signals
- Payment verification is handled by the middleware before reaching handlers
- All payment-related errors return 402 status with JSON error details

