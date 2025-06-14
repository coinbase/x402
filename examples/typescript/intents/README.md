# NEAR Intents x402 Payment Demo

By merging x402’s frictionless payments with [NEAR Intents](https://near.org/intents), we allow users to confidently buy anything through their AI agent, while agent developers collect revenue through cross-chain settlements that make blockchain complexity invisible.

In this example, we demonstrate how agents can use intents to receive USDC on NEAR with x402 payment.

- The process looks very similar to swapping Base USDC to NEAR USDC, but the agents don't need to deposit any Base USDC manually, which will be done automatically via x402 payment [client interceptor](./client.ts) after receiving the 402 response of its first request.
- We also implemented a server [middleware](./middleware.ts) for NEAR Intents which will calculate the amount of Base USDC that is required for each intent, and return the 402 response with the payment requirement (receiver address + USDC amount). The middleware is used in the [x402 proxy server](./server.ts) that redirects requests to NEAR Intents solver relay.

You can find a presentation about the example in this [recording](https://www.loom.com/share/0e636838552e412e881e6fc2e9ae6dff?sid=7cc00127-5bc8-4b33-96f9-c2dc1640ba7f).

## Setup and Configuration

### 1. Install Dependencies

First, we need to build and install all necessary packages:

```bash
# Navigate to the root directory and install root dependencies
cd ../../.. && pnpm install

# Build the x402 package which contains core functionality
cd typescript && pnpm run build

# Install the example's dependencies
cd ../examples/typescript && pnpm install && cd intents
```

### 2. Configure Environment

Set up your Base address private key and other configuration:

```bash
cp .env.example .env
```

Then edit `.env` to include:

- Your Base address private key (required for signing payment message)

## Running the Example

### 1. Start the Facilitator Server

The facilitator handles payment verification and settlement:

```bash
npm run facilitator
```

### 2. Start the Resource Server

The resource server acts as the x402 proxy endpoint for NEAR Intents RPC:

```bash
npm run server
```

### 3. Run the Client Demo

Execute demo that swaps $0.01 Base USDC to NEAR USDC:

```bash
npm run client
```

Important prerequisites:

- Must have USDC in your Base mainnet address
- Recommended minimum: 0.01 USDC for testing
- Ensure your Base address has enough ETH for gas
