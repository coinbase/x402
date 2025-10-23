# @coinbase/x402 Example Mainnet Server

This example demonstrates how to accept real USDC payments on Base mainnet using Coinbase's [hosted x402 facilitator](https://docs.cdp.coinbase.com/x402/docs/welcome).

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- CDP api keys (access via [Coinbase Developer Platform](https://docs.cdp.coinbase.com/))
- A valid Ethereum address for receiving payments

## Setup

1. Copy `.env-local` to `.env` and add your Ethereum address to receive payments:

```bash
cp .env-local .env
```

2. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd servers/mainnet
```

3. Run the server
```bash
pnpm install
pnpm dev
```

## Testing the Server

You can test the server using one of the example clients:

### Using the Fetch Client
```bash
cd ../clients/fetch
# Ensure .env is setup
pnpm install
pnpm dev
```

### Using the Axios Client
```bash
cd ../clients/axios
# Ensure .env is setup
pnpm install
pnpm dev
```
