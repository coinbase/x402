# x402-fetch Example Client

Example client demonstrating how to use `@x402/fetch` to make HTTP requests to endpoints protected by the x402 payment protocol.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A running x402 server (see [express server example](../../servers/express))
- Valid EVM and/or SVM private keys for making payments

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install && pnpm build
cd clients/fetch
```

2. Copy `.env-local` to `.env` and add your private keys:
```bash
cp .env-local .env
```

Required environment variables:
- `EVM_PRIVATE_KEY` - Ethereum private key for EVM payments
- `SVM_PRIVATE_KEY` - Solana private key for SVM payments

3. Run the client:
```bash
pnpm start
```

## Available Examples

### 1. Builder Pattern (`builder-pattern`)
Configure the client by chaining `.register()` calls to map scheme patterns to mechanism clients.

```bash
pnpm start builder-pattern
```

### 2. Mechanism Helper Registration (`mechanism-helper-registration`)
Use convenience helper functions from `@x402/evm` and `@x402/svm` to register supported networks.

```bash
pnpm start mechanism-helper-registration
```

## Example Code

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

// Create signer
const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

// Configure client with builder pattern
const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(signer));

// Wrap fetch with payment handling
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

// Make request to paid endpoint
const response = await fetchWithPayment("http://localhost:4021/weather");
const body = await response.json();
console.log(body);
```

## Next Steps

See [Advanced Examples](../advanced/) for payment lifecycle hooks and setting network preferences.
