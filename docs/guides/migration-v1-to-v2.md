---
title: "Migration Guide: V1 to V2"
description: "This guide helps you migrate from x402 V1 to V2. The V2 protocol introduces standardized identifiers, improved type safety, and a more modular architecture."
---

## Overview

| Aspect | V1 | V2 |
|--------|----|----|
| Payment Header | `X-PAYMENT` | `PAYMENT-SIGNATURE` |
| Response Header | `X-PAYMENT-RESPONSE` | `PAYMENT-RESPONSE` |
| Network Format | String (`base-sepolia`) | CAIP-2 (`eip155:84532`) |
| Version Field | `x402Version: 1` | `x402Version: 2` |
| Packages | `x402`, `x402-express`, `x402-axios` | `@x402/core`, `@x402/express`, `@x402/axios`, `@x402/evm` |

## For Buyers (Client-Side)

### Before (V1)

```typescript
import { withPaymentInterceptor } from "x402-axios";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import axios from "axios";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(),
});

// V1 pattern
const api = withPaymentInterceptor(
  axios.create({ baseURL: "https://api.example.com" }),
  walletClient,
);

const response = await api.get("/paid-endpoint");
```

### After (V2)

```typescript
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

// V2 pattern: Create client and register scheme separately
const client = new x402Client();
registerExactEvmScheme(client, { signer });

// Wrap axios with payment handling
const api = wrapAxiosWithPayment(
  axios.create({ baseURL: "https://api.example.com" }),
  client,
);

const response = await api.get("/paid-endpoint");
```

### Key Changes

1. **Package rename**: `x402-axios` → `@x402/axios`
2. **Function rename**: `withPaymentInterceptor` → `wrapAxiosWithPayment`
3. **Wallet setup**: Use `x402Client` with `registerExactEvmScheme` helper instead of passing wallet directly
4. **No chain-specific configuration**: The V2 client automatically handles network selection based on payment requirements

## For Sellers (Server-Side)

### Before (V1)

```typescript
import { paymentMiddleware, FacilitatorConfig } from "x402-express";
import express from "express";

const app = express();

const facilitatorConfig: FacilitatorConfig = {
  url: "https://x402.org/facilitator",
};

app.use(
  paymentMiddleware(facilitatorConfig, {
    "GET /weather": {
      price: "$0.001",
      network: "base-sepolia", // V1 string format
      config: {
        description: "Get weather data",
      },
    },
  }),
);
```

### After (V2)

```typescript
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const app = express();
const payTo = "0xYourAddress";

// V2 pattern: Create facilitator client and resource server
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator"
});

const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532", // V2 CAIP-2 format
            payTo,
          },
        ],
        description: "Get weather data",
        mimeType: "application/json",
      },
    },
    server,
  ),
);
```

### Key Changes

1. **Package rename**: `x402-express` → `@x402/express`
2. **Configuration structure**: Route config now uses `accepts` array with explicit `scheme`, `network`, and `payTo`
3. **Network format**: `base-sepolia` → `eip155:84532` (CAIP-2 standard)
4. **Resource server**: Create `x402ResourceServer` with facilitator client and register schemes using helper functions
5. **Price recipient**: Explicitly specify `payTo` address per route

## Network Identifier Mapping

| V1 Name | V2 CAIP-2 ID | Chain ID | Description |
|---------|--------------|----------|-------------|
| `base-sepolia` | `eip155:84532` | 84532 | Base Sepolia Testnet |
| `base` | `eip155:8453` | 8453 | Base Mainnet |
| `ethereum` | `eip155:1` | 1 | Ethereum Mainnet |
| `sepolia` | `eip155:11155111` | 11155111 | Ethereum Sepolia Testnet |
| `solana-devnet` | `solana:devnet` | - | Solana Devnet |
| `solana` | `solana:mainnet` | - | Solana Mainnet |

## Package Migration Reference

| V1 Package | V2 Package(s) |
|------------|---------------|
| `x402` | `@x402/core` |
| `x402-express` | `@x402/express` |
| `x402-axios` | `@x402/axios` |
| `x402-fetch` | `@x402/fetch` |
| `x402-hono` | `@x402/hono` |
| `x402-next` | `@x402/next` |
| (built-in) | `@x402/evm` (EVM support) |
| (built-in) | `@x402/svm` (Solana support) |

## Header Changes

If you're implementing custom HTTP handling, update your header names:

```typescript
// V1
const payment = req.header("X-PAYMENT");
res.setHeader("X-PAYMENT-RESPONSE", responseData);

// V2
const payment = req.header("PAYMENT-SIGNATURE");
res.setHeader("PAYMENT-RESPONSE", responseData);
```

## Troubleshooting

### "Cannot find module" errors

Ensure you've installed all V2 packages:

```bash
# For buyers
npm install @x402/axios @x402/evm

# For sellers (Express)
npm install @x402/express @x402/core @x402/evm
```

### Payment verification failures

- Check you're using CAIP-2 network identifiers (`eip155:84532` not `base-sepolia`)
- Verify your `payTo` address is correctly configured
- Ensure the facilitator URL is correct for your network (testnet vs mainnet)

### Mixed V1/V2 compatibility

The facilitator supports both V1 and V2 protocols. During migration, your V2 server can still accept payments from V1 clients, but we recommend updating clients to V2 for full feature support.

## Next Steps

- [Quickstart for Buyers](/getting-started/quickstart-for-buyers)
- [Quickstart for Sellers](/getting-started/quickstart-for-sellers)
- [Network and Token Support](/core-concepts/network-and-token-support)
