# Advanced x402 Client Examples

This directory contains advanced, production-ready patterns for x402 TypeScript clients using fetch. These examples go beyond the basics to demonstrate sophisticated techniques for building robust, scalable payment-enabled applications.

## What This Shows

Advanced patterns for production environments:
- **Payment Lifecycle Hooks**: Custom logic at different payment stages

## Examples

### 1. Payment Lifecycle Hooks (`hooks`)

**Production Pattern**: Register hooks for payment creation lifecycle events

```bash
npm start hooks
```

**Demonstrates:**
- onBeforePaymentCreation: Custom validation before payment
- onAfterPaymentCreation: Logging and metrics after payment
- onPaymentCreationFailure: Error recovery strategies
- Payment event lifecycle management

**Use When:**
- Need to log payment events for debugging/monitoring
- Want custom validation before allowing payments
- Require error recovery from payment failures
- Building observable payment systems

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- An Ethereum private key (testnet recommended)
- A running x402 server (see [server examples](../../servers/))
- Understanding of [basic fetch client](../fetch/)

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd clients/advanced
```

2. Copy `.env-example` to `.env` and add your Ethereum private key:
```bash
cp .env-example .env
```

## Running Examples

```bash
# Run specific advanced example
npm start hooks
# or
pnpm dev:hooks
```

## Architecture Patterns

### Payment Lifecycle Hooks

Register hooks for complete observability and control:

```typescript
import { x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);

const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(signer))
  .onBeforePaymentCreation(async (context) => {
    // Custom validation logic
    console.log("Creating payment for:", context.selectedRequirements);
    // Optionally abort: return { abort: true, reason: "Not allowed" };
  })
  .onAfterPaymentCreation(async (context) => {
    // Log successful payment creation
    console.log("Payment created:", context.version);
    // Send to analytics, database, etc.
  })
  .onPaymentCreationFailure(async (context) => {
    // Handle failures
    console.error("Payment failed:", context.error);
    // Optionally recover with alternative method
  });
```

## Production Considerations

### Hook Best Practices

1. **Keep hooks fast**: Avoid blocking operations
2. **Handle errors gracefully**: Don't throw in hooks
3. **Log appropriately**: Use structured logging
4. **Avoid side effects in before hooks**: Only use for validation

### Error Recovery Strategy

Implement intelligent error handling in failure hooks:

```typescript
client.onPaymentCreationFailure(async (context) => {
  const errorType = classifyError(context.error);
  
  switch (errorType) {
    case "network":
      // Retry logic handled by client
      return undefined;
    case "insufficient_balance":
      // Alert user, no recovery
      notifyUser("Insufficient balance");
      return undefined;
    case "signing_error":
      // Attempt recovery with different method
      return {
        recovered: true,
        payload: await createAlternativePayment(),
      };
  }
});
```

## Testing Against Local Server

1. Start server:
```bash
cd ../../servers/express
pnpm dev
```

2. Run advanced examples:
```bash
cd ../../clients/advanced
pnpm dev:hooks
```

## Comparison: Basic vs Advanced

| Feature | Basic Client | Advanced Client |
|---------|-------------|-----------------|
| Payment Hooks | None | ✅ Lifecycle event handling |
| Observability | Minimal | ✅ Comprehensive logging |
| Error Recovery | Basic | ✅ Intelligent strategies |
| Production Ready | Basic | ✅ Battle-tested patterns |

## Next Steps

- **[Basic Fetch Client](../fetch/)**: Start here if you haven't already
- **[Basic Axios Client](../axios/)**: Alternative HTTP client
- **[Custom Client](../custom/)**: Learn the internals
- **[Server Examples](../../servers/)**: Build complementary servers

## Related Resources

- [x402 Core Package Documentation](../../../../typescript/packages/core/)
- [x402 Fetch Package Documentation](../../../../typescript/packages/x402-fetch/)
- [Production Deployment Guide](../../../../docs/production.md)

