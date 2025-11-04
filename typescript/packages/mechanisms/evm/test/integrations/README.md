# EVM Integration Tests

These integration tests verify the complete EVM payment flow on Base Sepolia testnet using real on-chain transactions.

## Setup

### 1. Environment Variables

Create a `.env` file in the `evm` package root with the following variables:

```bash
# Client private key (needs USDC balance on Base Sepolia)
CLIENT_PRIVATE_KEY=0x...

# Facilitator private key (will receive payments)
FACILITATOR_PRIVATE_KEY=0x...
```

### 2. Fund the Client Account

The client account needs USDC on Base Sepolia to create valid payments:

1. Get Base Sepolia ETH from a faucet (for gas fees)
2. Get Base Sepolia USDC:
   - Contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - You can bridge or use a testnet faucet

### 3. Running Integration Tests

```bash
# Run unit tests only (default)
pnpm test

# Run integration tests only
pnpm test:integration

# Run all tests (unit + integration)
vitest run --config vitest.config.ts --exclude []
```

## What the Tests Do

### Test 1: Direct Client/Server Flow
- Client creates a payment payload for 0.10 USDC
- Server verifies the payment (checks signature, balance, amount)
- Server settles the payment (executes on-chain transaction)
- Validates the complete flow end-to-end

### Test 2: HTTP Middleware Flow
- Simulates HTTP middleware interaction
- Client receives 402 Payment Required response
- Client creates payment and sends PAYMENT-SIGNATURE header
- Server verifies and processes the payment
- Returns PAYMENT-RESPONSE header on success

## Notes

- Tests use real Base Sepolia RPC endpoints
- Actual on-chain transactions are created and submitted
- Each test will consume gas fees and transfer USDC
- Tests may fail if:
  - Client account has insufficient USDC balance
  - RPC endpoints are down or rate-limited
  - Network congestion causes timeouts

