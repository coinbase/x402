# x402 Facilitator Example

This is an example implementation of an x402 facilitator service that handles payment verification and settlement for the x402 payment protocol. This implementation is for testing and demonstration purposes only and should only be run on the Base Sepolia testnet.

## Overview

The facilitator provides two main endpoints:
- `/verify`: Verifies x402 payment payloads
- `/settle`: Settles x402 payments by signing and broadcasting transactions

This example demonstrates how to:
1. Set up a basic Express server to handle x402 payment verification and settlement
2. Integrate with the x402 protocol's verification and settlement functions
3. Handle payment payload validation and error cases

## Prerequisites

- Node.js (v20 or higher)
- A valid Ethereum private key for Base Sepolia
- Base Sepolia testnet ETH for transaction fees

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env` file with the following variables:
```env
PRIVATE_KEY=0xYourPrivateKey
PORT=3000
```

3. Start the server:
```bash
pnpm dev
```

The server will start on http://localhost:3000

## API Endpoints

### GET /verify
Returns information about the verify endpoint.

### POST /verify
Verifies an x402 payment payload.

Request body:
```typescript
{
  payload: string;  // x402 payment payload
  details: PaymentRequirements;  // Payment requirements
}
```

### GET /settle
Returns information about the settle endpoint.

### POST /settle
Settles an x402 payment by signing and broadcasting the transaction.

Request body:
```typescript
{
  payload: string;  // x402 payment payload
  details: PaymentRequirements;  // Payment requirements
}
```

## Usage with Example Servers

This facilitator is designed to work with the example servers in the `examples/typescript/servers` directory. For example, you can use it with the express server and the fetch client to test end-to-end payment flows.

