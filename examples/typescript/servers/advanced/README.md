# Advanced Express Server Examples

This directory contains advanced examples demonstrating various x402 features and patterns for TypeScript servers using the Express framework.

## Examples

### 1. Bazaar Discovery Extension (`bazaar`)

**What it demonstrates:**
- Adding the Bazaar discovery extension to make your API discoverable
- Providing input/output schemas for machine-readable API documentation
- Enabling clients and facilitators to discover your API capabilities

**Use case:** When you want your x402-protected API to be discoverable by clients, AI agents, or through facilitator discovery mechanisms.

```bash
npm start bazaar
```

### 2. Dynamic PayTo (`dynamic-pay-to`)

**What it demonstrates:**
- Using a function to dynamically resolve the payment recipient address
- Routing payments based on request context
- Implementing marketplace-style payment routing

**Use case:** Marketplace applications where payments should go to different sellers, content creators, or service providers based on the resource being accessed.

```bash
npm start dynamic-pay-to
```

### 3. Custom Money Definition (`custom-money-definition`)

**What it demonstrates:**
- Registering custom money parsers for alternative tokens
- Using different tokens based on network or amount
- Chain of responsibility pattern for price parsing

**Use case:** When you want to accept payments in tokens other than USDC, or use different tokens based on conditions (e.g., DAI for large amounts, custom tokens for specific networks).

```bash
npm start custom-money-definition
```

### 4. Dynamic Price (`dynamic-price`)

**What it demonstrates:**
- Using a function to dynamically calculate prices
- Implementing tiered pricing (premium vs. standard)
- Context-based pricing decisions

**Use case:** Implementing tiered pricing, user-based pricing, content-based pricing, or any scenario where the price varies based on the request.

```bash
npm start dynamic-price
```

### 5. Lifecycle Hooks (`hooks`)

**What it demonstrates:**
- Registering hooks for payment verification and settlement lifecycle
- Running custom logic before/after verification and settlement
- Implementing error recovery and custom validation
- Logging and side effects

**Use case:** When you need to:
- Log payment events to a database or monitoring system
- Perform custom validation before processing payments
- Implement retry or recovery logic for failed payments
- Trigger side effects (notifications, database updates) after successful payments

```bash
npm start hooks
```

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- An Ethereum address to receive payments (testnet recommended)
- Access to an x402 facilitator (e.g., `https://x402.org/facilitator`)

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd servers/advanced
```

2. Copy `.env-local` to `.env` and configure:

```bash
cp .env-local .env
```

Edit `.env`:
```bash
EVM_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
SVM_ADDRESS=YourSolanaAddress
FACILITATOR_URL=https://x402.org/facilitator
```

## Running the Examples

**Each example can be run individually:**

```bash
npm start bazaar
npm start hooks
npm start dynamic-price
npm start dynamic-pay-to
npm start custom-money-definition
```

Or use the convenience scripts:

```bash
pnpm dev                         # bazaar (default)
pnpm dev:bazaar                  # bazaar
pnpm dev:hooks                   # hooks
pnpm dev:dynamic-price           # dynamic-price
pnpm dev:dynamic-pay-to          # dynamic-pay-to
pnpm dev:custom-money-definition # custom-money-definition
```

## Understanding the Patterns

### Dynamic Configuration

Both `dynamic-pay-to` and `dynamic-price` demonstrate using functions for runtime resolution. Instead of static values, you can provide functions that calculate the recipient address or price based on the request context.

### Custom Money Parsers

The `custom-money-definition` example shows how to register custom token parsers. Parsers are tried in order until one returns a result, allowing you to support multiple tokens.

### Lifecycle Hooks

The `hooks` example demonstrates all six lifecycle hooks:
- `onBeforeVerify`: Run before verification (can abort)
- `onAfterVerify`: Run after successful verification
- `onVerifyFailure`: Run when verification fails (can recover)
- `onBeforeSettle`: Run before settlement (can abort)
- `onAfterSettle`: Run after successful settlement  
- `onSettleFailure`: Run when settlement fails (can recover)

See `hooks.ts` for complete hook implementations.

## Testing the Servers

Use one of the example clients to test these servers:

```bash
# Start the server in one terminal
cd servers/advanced
pnpm dev:hooks

# In another terminal, run a client
cd ../../clients/fetch
pnpm dev
```

## Next Steps

- **[Basic Express Example](../express/)**: Start with the basics if you haven't already
- **[Custom Server Example](../custom/)**: Learn how to implement x402 without middleware
- **[Client Examples](../../clients/)**: Build clients that can interact with these servers

## Related Resources

- [x402 Express Package Documentation](../../../../typescript/packages/x402-express/)
- [x402 Core Package Documentation](../../../../typescript/packages/core/)
- [Go Server Examples](../../../go/servers/) - Similar patterns in Go

