# Advanced x402 Client Examples

Advanced patterns for x402 TypeScript clients demonstrating builder pattern registration, payment lifecycle hooks, and network preferences.

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(privateKeyToAccount(evmPrivateKey)))
  .onBeforePaymentCreation(async ctx => {
    console.log("Creating payment for:", ctx.selectedRequirements.network);
  })
  .onAfterPaymentCreation(async ctx => {
    console.log("Payment created:", ctx.paymentPayload.x402Version);
  });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment("http://localhost:4021/weather");
```

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- Valid EVM and/or SVM private keys for making payments
- A running x402 server (see [server examples](../../servers/))
- Familiarity with the [basic fetch client](../fetch/)

## Setup

1. Copy `.env-local` to `.env`:

```bash
cp .env-local .env
```

and fill required environment variables:

- `EVM_PRIVATE_KEY` - Ethereum private key for EVM payments
- `SVM_PRIVATE_KEY` - Solana private key for SVM payments

2. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install && pnpm build
cd clients/advanced
```

3. Run the server

```bash
pnpm dev
```

## Available Examples

Each example demonstrates a specific advanced pattern:

| Example             | Command                      | Description                       |
| ------------------- | ---------------------------- | --------------------------------- |
| `builder-pattern`   | `pnpm dev:builder-pattern`   | Fine-grained network registration |
| `hooks`             | `pnpm dev:hooks`             | Payment lifecycle hooks           |
| `preferred-network` | `pnpm dev:preferred-network` | Client-side network preferences   |

## Testing the Examples

Start a server first:

```bash
cd ../../servers/express
pnpm dev
```

Then run the examples:

```bash
cd ../../clients/advanced
pnpm dev:builder-pattern
```

## Example: Builder Pattern Registration

Use the builder pattern for fine-grained control over which networks are supported and with which signers:

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const evmSigner = privateKeyToAccount(evmPrivateKey);
const mainnetSigner = privateKeyToAccount(mainnetPrivateKey);

// More specific patterns take precedence over wildcards
const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(evmSigner)) // All EVM networks
  .register("eip155:1", new ExactEvmScheme(mainnetSigner)) // Ethereum mainnet override
  .register("solana:*", new ExactSvmScheme(svmSigner)); // All Solana networks

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment("http://localhost:4021/weather");
```

**Use case:**

- Different signers for mainnet vs testnet
- Separate keys for different networks
- Explicit control over supported networks

## Example: Payment Lifecycle Hooks

Register custom logic at different payment stages for observability and control:

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(signer))
  .onBeforePaymentCreation(async context => {
    console.log("Creating payment for:", context.selectedRequirements);
    // Abort payment by returning: { abort: true, reason: "Not allowed" }
  })
  .onAfterPaymentCreation(async context => {
    console.log("Payment created:", context.paymentPayload.x402Version);
    // Send to analytics, database, etc.
  })
  .onPaymentCreationFailure(async context => {
    console.error("Payment failed:", context.error);
    // Recover by returning: { recovered: true, payload: alternativePayload }
  });

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment("http://localhost:4021/weather");
```

Available hooks:

- `onBeforePaymentCreation` — Run before payment creation (can abort)
- `onAfterPaymentCreation` — Run after successful payment creation
- `onPaymentCreationFailure` — Run when payment creation fails (can recover)

**Use case:**

- Log payment events for debugging and monitoring
- Custom validation before allowing payments
- Implement retry or recovery logic for failed payments
- Metrics and analytics collection

## Example: Preferred Network Selection

Configure client-side network preferences with automatic fallback:

```typescript
import { x402Client, wrapFetchWithPayment, type PaymentRequirements } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";

// Define network preference order (most preferred first)
const networkPreferences = ["solana:", "eip155:"];

const preferredNetworkSelector = (
  _x402Version: number,
  options: PaymentRequirements[],
): PaymentRequirements => {
  // Try each preference in order
  for (const preference of networkPreferences) {
    const match = options.find(opt => opt.network.startsWith(preference));
    if (match) return match;
  }
  // Fallback to first mutually-supported option
  return options[0];
};

const client = new x402Client(preferredNetworkSelector)
  .register("eip155:*", new ExactEvmScheme(evmSigner))
  .register("solana:*", new ExactSvmScheme(svmSigner));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment("http://localhost:4021/weather");
```

**Use case:**

- Prefer payments on specific chains
- User preference settings in wallet UIs

## Hook Best Practices

1. **Keep hooks fast** — Avoid blocking operations
2. **Handle errors gracefully** — Don't throw in hooks
3. **Log appropriately** — Use structured logging
4. **Avoid side effects in before hooks** — Only use for validation
