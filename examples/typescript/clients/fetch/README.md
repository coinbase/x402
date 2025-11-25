# x402-fetch Example Client

This is an example client that demonstrates how to use the `x402-fetch` package to make HTTP requests to endpoints protected by the x402 payment protocol.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A running x402 server (you can use the example express server at `examples/typescript/servers/express`)
- A valid Ethereum private key for making payments

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd clients/fetch
```

2. Copy `.env-local` to `.env` and add your Ethereum private key:
```bash
cp .env-local .env
```

3. Start the example client:

```bash
# Run the default example (builder-pattern)
pnpm start

# Or run a specific example:
pnpm start builder-pattern
pnpm start mechanism-helper-registration

# Or use the convenience scripts:
pnpm dev                                # builder-pattern
pnpm dev:mechanism-helper-registration  # mechanism-helper-registration
```

## Available Examples

This package contains two examples demonstrating different ways to configure the x402 client:

### 1. Builder Pattern (`builder-pattern`)
Demonstrates the basic way to configure the client by chaining `registerScheme` calls to map scheme patterns to mechanism clients.

### 2. Mechanism Helper Registration (`mechanism-helper-registration`)
Shows how to use convenience helper functions provided by `@x402/evm` and `@x402/svm` packages to register all supported networks with recommended defaults.

## How It Works

The examples demonstrate how to:
1. Create and configure an x402Client with different patterns
2. Register mechanism clients for different blockchain schemes (EVM, SVM)
3. Wrap the native fetch function with x402 payment handling
4. Make a request to a paid endpoint
5. Handle the response and payment details

## Example Code

Here's a simplified version of the builder pattern:

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmClient } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

// Create signer
const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

// Configure client with builder pattern
const client = new x402Client()
  .register("eip155:*", new ExactEvmClient(signer));

// Wrap fetch with payment handling
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// Make request to paid endpoint
const response = await fetchWithPayment("http://localhost:4021/weather", {
  method: "GET",
});
const body = await response.json();
console.log(body);
```

See the individual example files for more detailed demonstrations:
- `builder-pattern.ts` - Basic builder pattern
- `mechanism-helper-registration.ts` - Using helper functions

For advanced examples including hooks, custom transports, and more, see `../advanced/`.
