# Custom x402 Server Implementation

This example demonstrates how to implement x402 payment handling **manually** without using the pre-built middleware packages like `@x402/express` or `@x402/hono`.

## What This Example Shows

- **Manual Payment Flow**: Direct handling of payment verification and settlement
- **Core Package Usage**: Using `x402ResourceServer` from `@x402/core` directly
- **Custom Middleware**: Building your own payment middleware from scratch
- **Header Management**: Manual encoding/decoding of payment headers
- **Complete Control**: Every step of the payment process is visible and customizable

## Why Use Custom Implementation?

You should implement custom payment handling when you need:

1. **Framework Support**: Integration with unsupported web frameworks
2. **Complete Control**: Fine-grained control over every step
3. **Custom Logic**: Custom error handling, logging, or business logic
4. **Learning**: Understanding how x402 middleware works internally

## Architecture

The custom implementation demonstrates these key components:

### Payment Flow

1. **Request Arrives**: Middleware intercepts all requests
2. **Route Check**: Determine if route requires payment
3. **Payment Check**: Look for `X-PAYMENT` header
4. **Decision Point**:
   - **No Payment**: Return 402 with requirements in `X-PAYMENT` header
   - **Payment Provided**: Verify with facilitator
5. **Verification**: Check payment signature and validity
6. **Handler Execution**: Run protected endpoint handler
7. **Settlement**: Settle payment on-chain (for 2xx responses)
8. **Response**: Add settlement details in `X-PAYMENT-RESPONSE` header

See `index.ts` for complete implementation of all steps.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- An Ethereum address to receive payments (testnet recommended)
- Access to an x402 facilitator

## Setup

1. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install
pnpm build
cd servers/custom
```

2. Copy `.env-local` to `.env` and configure:

```bash
cp .env-local .env
```

Edit `.env`:

```bash
EVM_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
FACILITATOR_URL=https://x402.org/facilitator
```

## Running the Server

```bash
pnpm dev
```

## Testing the Server

### Without Payment

```bash
curl http://localhost:4021/weather
```

Response (402 Payment Required):

```json
{
  "error": "Payment Required",
  "message": "This endpoint requires payment"
}
```

With payment requirements in the `X-PAYMENT` response header.

### With Payment

Use one of the example clients:

```bash
# In another terminal
cd ../../clients/fetch
pnpm dev
```

## Key Implementation Details

### 1. Defining Payment Requirements

```typescript
const routeRequirements: Record<string, PaymentRequirements> = {
  "GET /weather": {
    scheme: "exact",
    price: "$0.001",
    network: "eip155:84532",
    payTo: evmAddress,
  },
};
```

### 2. Checking for Payment

```typescript
const paymentHeader = req.headers["x-payment"] as string | undefined;

if (!paymentHeader) {
  // Return 402 with requirements
  const requirementsHeader = Buffer.from(
    JSON.stringify({ accepts: requirements }),
  ).toString("base64");

  res.status(402).set("X-PAYMENT", requirementsHeader).json({
    error: "Payment Required",
  });
  return;
}
```

### 3. Verifying Payment

```typescript
const paymentPayload = JSON.parse(
  Buffer.from(paymentHeader, "base64").toString("utf-8"),
);

const verifyResult = await resourceServer.verifyPayment(
  paymentPayload,
  requirements,
);

if (!verifyResult.isValid) {
  res.status(402).json({
    error: "Invalid Payment",
    reason: verifyResult.invalidReason,
  });
  return;
}
```

### 4. Settling Payment

```typescript
// After successful response
if (res.statusCode >= 200 && res.statusCode < 300) {
  const settleResult = await resourceServer.settlePayment(
    paymentPayload,
    requirements,
  );

  const settlementHeader = Buffer.from(JSON.stringify(settleResult)).toString(
    "base64",
  );

  res.set("X-PAYMENT-RESPONSE", settlementHeader);
}
```

## Comparison: Middleware vs Custom

| Aspect                 | With Middleware (@x402/express) | Custom Implementation |
| ---------------------- | ------------------------------- | --------------------- |
| Code Complexity        | ~10 lines                       | ~150 lines            |
| Automatic Verification | ✅ Yes                          | ❌ Manual             |
| Automatic Settlement   | ✅ Yes                          | ❌ Manual             |
| Header Management      | ✅ Automatic                    | ❌ Manual             |
| Flexibility            | Limited                         | ✅ Complete control   |
| Error Handling         | ✅ Built-in                     | ❌ You implement      |
| Maintenance            | x402 team                       | You maintain          |

## When to Use Each Approach

**Use Middleware (@x402/express, @x402/hono) when:**

- Building standard applications
- Want quick integration
- Prefer automatic payment handling
- Using supported frameworks (Express, Hono)

**Use Custom Implementation when:**

- Using unsupported frameworks
- Need complete control over flow
- Require custom error handling
- Want to understand internals
- Building custom abstractions

## Adapting to Other Frameworks

To use this pattern with other frameworks (Koa, Fastify, etc.):

1. Create middleware function for your framework
2. Check for payment requirements per route
3. Use `x402ResourceServer` to verify/settle payments
4. Intercept responses to add settlement headers

The pattern in `index.ts` can be adapted to any Node.js web framework.

## Next Steps

- **[Basic Express Server](../express/)**: See the simple way using middleware
- **[Advanced Examples](../advanced/)**: Explore dynamic pricing, hooks, and extensions
- **[Client Examples](../../clients/)**: Build clients to test this server

## Related Resources

- [x402 Core Package Documentation](../../../../typescript/packages/core/)
- [Express Documentation](https://expressjs.com/)
- [Payment Protocol Specification](../../../../specs/x402-specification.md)
