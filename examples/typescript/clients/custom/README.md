# Custom x402 Client Implementation

This example demonstrates how to implement x402 payment handling **manually** using only the core packages, without the convenience wrappers like `@x402/fetch` or `@x402/axios`.

## What This Example Shows

- **Manual HTTP Handling**: Direct interaction with 402 Payment Required responses
- **Core Package Usage**: Using `x402Client` from `@x402/core` directly
- **Payment Flow**: The complete flow from request → 402 → payment → retry → success
- **Header Management**: Manual encoding/decoding of payment headers
- **Settlement Extraction**: Reading settlement details from response headers

## Why Use Custom Implementation?

You should implement custom payment handling when you need:

1. **Complete Control**: Full control over every step of the payment flow
2. **Custom HTTP Clients**: Integration with non-standard HTTP libraries
3. **Fine-grained Logic**: Custom error handling, retry logic, or request modification
4. **Learning**: Understanding how x402 works under the hood

## Architecture

The custom implementation demonstrates these key steps:

### Payment Flow

1. **Initial Request**: Make HTTP request to protected endpoint
2. **402 Response**: Server responds with Payment Required and requirements in headers
3. **Parse Requirements**: Extract and decode payment requirements from `X-PAYMENT` header
4. **Create Payment**: Use `x402Client.createPayment()` to generate payment payload
5. **Retry with Payment**: Make new request with payment in `X-PAYMENT` header
6. **Success**: Receive 200 response with settlement details in `X-PAYMENT-RESPONSE` header

See `index.ts` for complete implementation of all steps.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- An Ethereum private key (testnet recommended)
- A running x402 server (see [server examples](../../servers/))

## Setup

1. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd clients/custom
```

2. Copy `.env-example` to `.env` and add your Ethereum private key:
```bash
cp .env-example .env
```

## Running the Example

```bash
pnpm start
# or
pnpm dev
```

## Example Output

```
🔧 Custom x402 Client Implementation Example

This example demonstrates manual payment handling without wrappers.

✅ Client configured with EVM payment scheme

🌐 Making initial request to: http://localhost:4021/weather

📥 Initial response status: 402

💳 Payment required! Processing payment requirements...

📋 Payment requirements:
   1. Network: eip155:84532, Scheme: exact, Price: $0.001

🔐 Creating payment payload...

✅ Payment created successfully

🔄 Retrying request with payment...

📥 Response with payment status: 200

✅ Request successful!

Response body: { city: 'San Francisco', weather: 'foggy', temperature: 60 }

💰 Payment Settlement Details:
   Transaction: 0x1234567890abcdef...
   Network: eip155:84532
   Payer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

🎉 Custom implementation completed successfully!
```

## Key Implementation Details

### 1. Detecting Payment Required

```typescript
if (response.status === 402) {
  const paymentHeader = response.headers.get("X-PAYMENT");
  // Parse requirements...
}
```

### 2. Creating Payment Payload

```typescript
const client = new x402Client()
  .register("eip155:*", new ExactEvmScheme(signer));

const paymentPayload = await client.createPayment(requirements);
const paymentHeader = Buffer.from(JSON.stringify(paymentPayload))
  .toString("base64");
```

### 3. Retrying with Payment

```typescript
const response = await fetch(url, {
  headers: {
    "X-PAYMENT": paymentHeader,
  },
});
```

### 4. Extracting Settlement

```typescript
const settlementHeader = response.headers.get("X-PAYMENT-RESPONSE");
const settlement = JSON.parse(
  Buffer.from(settlementHeader, "base64").toString("utf-8")
);
```

## Comparison: Wrapper vs Custom

| Aspect | With Wrapper (@x402/fetch) | Custom Implementation |
|--------|---------------------------|----------------------|
| Code Complexity | ~10 lines | ~100 lines |
| Automatic Retry | ✅ Yes | ❌ Manual |
| Error Handling | ✅ Built-in | ❌ You implement |
| Header Management | ✅ Automatic | ❌ Manual |
| Flexibility | Limited | ✅ Complete control |
| Maintenance | x402 team | You maintain |

## When to Use Each Approach

**Use Wrappers (@x402/fetch, @x402/axios) when:**
- Building standard applications
- Want quick integration
- Prefer automatic payment handling
- Don't need custom flow control

**Use Custom Implementation when:**
- Need complete control over flow
- Integrating with custom HTTP clients
- Implementing custom retry/error logic
- Learning the protocol internals

## Adapting to Other HTTP Clients

To use this pattern with other HTTP clients (axios, got, etc.):

1. Detect 402 status code
2. Extract payment requirements from headers
3. Use `x402Client.createPayment()` to create payload
4. Encode payload and add to retry request headers
5. Extract settlement from successful response headers

The pattern in `index.ts` can be adapted to any HTTP client library.

## Next Steps

- **[Basic Fetch Client](../fetch/)**: See the simple way using wrappers
- **[Advanced Examples](../advanced/)**: Explore hooks and advanced patterns
- **[Server Examples](../../servers/)**: Build servers that can receive these payments

## Related Resources

- [x402 Core Package Documentation](../../../../typescript/packages/core/)
- [Payment Protocol Specification](../../../../specs/x402-specification.md)

