# x402-next Example App (v2)

This is a Next.js application that demonstrates how to use the `@x402/next` v2 middleware to implement paywall functionality in your Next.js routes.

## Prerequisites

- Node.js v20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- A valid Ethereum address for receiving payments

## Setup

1. Copy `.env-local` to `.env` and add your Ethereum address to receive payments:

```bash
cp .env-local .env
```

Edit `.env` and set:
- `EVM_PAYEE_ADDRESS` - Your Ethereum address (e.g., `0x...`)
- `FACILITATOR_URL` - Facilitator service URL (default: `https://x402.org/facilitator`)
- `NETWORK` - Network identifier (default: `eip155:84532` for Base Sepolia)
- `CDP_CLIENT_KEY` - Optional Coinbase Developer Platform API key
- `APP_NAME` - Optional app name for wallet connection
- `APP_LOGO` - Optional logo URL path

2. Install and build all packages from the typescript examples root:
```bash
cd ../../
pnpm install
pnpm build
cd fullstack/next
```

3. Install dependencies and start the Next.js example:
```bash
pnpm install
pnpm dev
```

## Example Routes

The app includes protected routes that require payment to access:

### Protected Page Route

The `/protected` route requires a payment of $0.01 to access. The route is protected using the v2 x402-next middleware:

```typescript
// middleware.ts
import { paymentMiddleware } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { createPaywall } from "@x402/paywall";
import { evmPaywall } from "@x402/paywall/evm";

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
const server = new x402ResourceServer(facilitatorClient);

// Register EVM scheme
registerExactEvmScheme(server);

// Build paywall using v2 builder pattern
const paywall = createPaywall()
  .withNetwork(evmPaywall)
  .withConfig({
    appName: "Next x402 Demo",
    appLogo: "/x402-icon-blue.png",
    testnet: true,
  })
  .build();

export const middleware = paymentMiddleware(
  {
    "/protected": {
      accepts: {
        payTo: evmPayeeAddress,
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532",
      },
      description: "Access to protected content",
    },
  },
  server,
  undefined, // paywallConfig (using custom paywall instead)
  paywall, // custom paywall provider
);

export const config = {
  matcher: ["/protected/:path*"],
  runtime: "nodejs", // Required for v2
};
```

## Response Format

### Payment Required (402)
```json
{
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "price": "$0.01",
      "payTo": "0xYourAddress",
      "description": "Access to protected content"
    }
  ]
}
```

### Successful Response
```ts
// Headers
{
  "X-PAYMENT-RESPONSE": "..." // Encoded response object
}
```

## Extending the Example

To add more protected routes, update the middleware configuration:

```typescript
export const middleware = paymentMiddleware(
  {
    "/protected": {
      accepts: {
        payTo: evmPayeeAddress,
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532",
      },
      description: "Access to protected content",
    },
    "/api/premium": {
      accepts: {
        payTo: evmPayeeAddress,
        scheme: "exact",
        price: "$0.10",
        network: "eip155:84532",
      },
      description: "Premium API access",
    },
  },
  server,
  undefined,
  paywall,
);

export const config = {
  matcher: ["/protected/:path*", "/api/premium/:path*"],
  runtime: "nodejs",
};
```

## Multiple Payment Options

You can also provide multiple payment options using an array:

```typescript
{
  "/protected": {
    accepts: [
      {
        payTo: evmPayeeAddress,
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532",
      },
      {
        payTo: svmPayeeAddress,
        scheme: "exact",
        price: "$0.01",
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      },
    ],
    description: "Access to protected content",
  },
}
```



