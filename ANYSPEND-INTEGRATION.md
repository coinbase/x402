# Anyspend X402 Integration Guide

## Overview

This document describes how to integrate **Anyspend's multi-token and cross-chain payment capabilities** into X402 clients. With Anyspend, clients can:

- **Pay with any ERC-20 token** (WETH, DAI, USDT, etc.) instead of just USDC
- **Pay on a different network/chain** than the resource server
- Let Anyspend facilitator handle token swaps and cross-chain transfers automatically

By default, x402 clients pay with **USDC on the resource server's network**. Anyspend extends this to support **any token on any network**, while resource servers still receive USDC.

---

## Table of Contents

1. [What Was Implemented](#what-was-implemented)
2. [How It Works](#how-it-works)
3. [Quick Start](#quick-start)
4. [Client-Side Usage Examples](#client-side-usage-examples)
5. [Server-Side Configuration](#server-side-configuration)
6. [Supported Tokens & Networks](#supported-tokens--networks)
7. [HTTP Headers](#http-headers)
8. [Fee Structure](#fee-structure)
9. [TypeScript API](#typescript-api)
10. [Security](#security)
11. [Troubleshooting](#troubleshooting)
12. [References](#references)

---

## What Was Implemented

### ✅ Client-Side Changes (Public NPM Packages)

Added support for clients to specify **preferred payment token and network** when making X402 payments:

1. **Multi-token payments** - Pay with WETH, DAI, or any ERC-20 instead of USDC
2. **Cross-chain payments** - Pay on Ethereum while resource server receives USDC on Base
3. **Standard X402 compatibility** - No breaking changes, preferences are optional

### Files Modified

#### 1. `typescript/packages/x402-fetch/src/index.ts`
- Added `PaymentPreferences` interface with `preferredToken` and `preferredNetwork` fields
- Updated `wrapFetchWithPayment()` to accept optional `preferences` parameter
- Added logic to inject `X-PREFERRED-TOKEN` and `X-PREFERRED-NETWORK` headers into initial request
- Exported `PaymentPreferences` type for public use

#### 2. `typescript/packages/x402-axios/src/index.ts`
- Added `PaymentPreferences` interface (same as x402-fetch)
- Updated `withPaymentInterceptor()` to accept optional `preferences` parameter
- Added request interceptor to inject preference headers on all requests
- Exported `PaymentPreferences` type for public use

#### 3. Examples
- `examples/typescript/clients/fetch/index-with-preferences.ts` - Complete fetch examples
- `examples/typescript/clients/axios/index-with-preferences.ts` - Complete axios examples

---

## How It Works

### Protocol Flow

```
1. Client → Resource Server: Initial request
   Headers: {
     X-PREFERRED-TOKEN: "0xWETH..."     // Optional: preferred token address
     X-PREFERRED-NETWORK: "base"        // Optional: preferred network
   }

2. Resource Server → Client: 402 Payment Required
   {
     requirements: {
       asset: "0xWETH...",               // WETH address (not USDC!)
       amount: "300000000000000",        // 0.0003 WETH in wei
       network: "base",
       recipient: "0xResourceServer..."
     }
   }

3. Client signs and pays with WETH (standard X402 protocol)
   - Server receives payment and handles token conversion
   - Resource server ultimately receives USDC
```

### Key Benefits

✅ **Client uses standard X402 protocol** - no Anyspend-specific code needed
✅ **Flexible payment options** - pay with any supported token
✅ **Automatic token conversion** - handled transparently by the server
✅ **Cross-chain payments** - pay on Ethereum, settle on Base, etc.

---

## Quick Start

### Installation

```bash
# For fetch-based applications
npm install x402-fetch

# For axios-based applications
npm install x402-axios
```

### Basic Usage

```typescript
import { wrapFetchWithPayment, createSigner, type PaymentPreferences } from "x402-fetch";

// 1. Create signer
const signer = await createSigner("base-sepolia", privateKey);

// 2. Specify payment preferences (optional)
const preferences: PaymentPreferences = {
  preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base
  preferredNetwork: "base-sepolia"
};

// 3. Wrap fetch with payment support
const fetchWithPayment = wrapFetchWithPayment(
  fetch,
  signer,
  undefined, // maxValue
  undefined, // paymentRequirementsSelector
  undefined, // config
  preferences
);

// 4. Make requests - payment handled automatically
const response = await fetchWithPayment('https://api.example.com/data');
```

---

## Usage Examples

### x402-fetch

#### Default Behavior (USDC)

```typescript
import { wrapFetchWithPayment, createSigner } from "x402-fetch";

const signer = await createSigner("base-sepolia", privateKey);
const fetchDefault = wrapFetchWithPayment(fetch, signer);

// Pays with USDC on base-sepolia (default)
await fetchDefault('https://api.example.com/data');
```

#### Pay with WETH on Base

```typescript
import { wrapFetchWithPayment, createSigner, type PaymentPreferences } from "x402-fetch";

const signer = await createSigner("base-sepolia", privateKey);

const preferences: PaymentPreferences = {
  preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base
  preferredNetwork: "base-sepolia"
};

const fetchWithWeth = wrapFetchWithPayment(
  fetch,
  signer,
  undefined, // maxValue
  undefined, // paymentRequirementsSelector
  undefined, // config
  preferences
);

// Pays with WETH, Anyspend swaps to USDC, resource server receives USDC
await fetchWithWeth('https://api.example.com/data');
```

#### Cross-Chain Payment (Ethereum → Base)

```typescript
import { wrapFetchWithPayment, createSigner, type PaymentPreferences } from "x402-fetch";

// Create signer for Ethereum
const ethereumSigner = await createSigner("ethereum-sepolia", privateKey);

// Specify Ethereum preferences
const ethPreferences: PaymentPreferences = {
  preferredToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Ethereum Sepolia
  preferredNetwork: "ethereum-sepolia"
};

const fetchCrossChain = wrapFetchWithPayment(
  fetch,
  ethereumSigner,
  undefined,
  undefined,
  undefined,
  ethPreferences
);

// Client pays WETH on Ethereum → Anyspend bridges → Resource server receives USDC on Base
await fetchCrossChain('https://api.example.com/data');
```

### x402-axios

#### Default Behavior (USDC)

```typescript
import axios from "axios";
import { withPaymentInterceptor, createSigner } from "x402-axios";

const signer = await createSigner("base-sepolia", privateKey);
const client = axios.create({ baseURL: "https://api.example.com" });

withPaymentInterceptor(client, signer);

// Pays with USDC
await client.get('/data');
```

#### Pay with WETH

```typescript
import axios from "axios";
import { withPaymentInterceptor, createSigner, type PaymentPreferences } from "x402-axios";

const signer = await createSigner("base-sepolia", privateKey);

const wethPreferences: PaymentPreferences = {
  preferredToken: "0x4200000000000000000000000000000000000006", // WETH on Base
  preferredNetwork: "base-sepolia"
};

const wethClient = axios.create({ baseURL: "https://api.example.com" });
withPaymentInterceptor(wethClient, signer, undefined, undefined, wethPreferences);

// Pays with WETH
await wethClient.get('/data');
```

#### Reusable Client with Preferences

```typescript
import axios from "axios";
import { withPaymentInterceptor, createSigner, type PaymentPreferences } from "x402-axios";

const signer = await createSigner("base-sepolia", privateKey);

// Create client that always uses DAI
const daiClient = axios.create({ baseURL: "https://api.example.com" });
withPaymentInterceptor(daiClient, signer, undefined, undefined, {
  preferredToken: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
  preferredNetwork: "base-sepolia"
});

// All requests automatically use DAI
await daiClient.get('/data');
await daiClient.post('/compute', { input: "..." });
await daiClient.get('/analytics');
```

---

## Server-Side Configuration

Resource servers can configure their x402 middleware to accept different tokens (USDC, WETH, DAI, etc.) for payments. There are three main approaches:

### Method 1: USDC (Simple String Format)

The easiest way - just specify a dollar amount, and the middleware automatically uses USDC:

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();

app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "GET /weather": {
      price: "$0.001", // Automatically uses USDC
      network: "base-sepolia"
    }
  },
  { url: "https://x402.org/facilitator" }
));

app.get("/weather", (req, res) => {
  res.json({ weather: "sunny", temperature: 70 });
});

app.listen(4021);
```

### Method 2: Custom ERC-20 Token (Explicit Format)

Specify any ERC-20 token by providing full token details using the `ERC20TokenAmount` format:

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();

app.use(paymentMiddleware(
  "0xYourAddress",
  {
    // WETH payment endpoint
    "GET /premium/weth": {
      price: {
        amount: "100000000000000", // Amount in atomic units (18 decimals for WETH)
        asset: {
          address: "0x4200000000000000000000000000000000000006", // WETH on Base Sepolia
          decimals: 18,
          eip712: {
            name: "Wrapped Ether",
            version: "1"
          }
        }
      },
      network: "base-sepolia"
    },

    // DAI payment endpoint
    "GET /premium/dai": {
      price: {
        amount: "1000000000000000", // 0.001 DAI (18 decimals)
        asset: {
          address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI on Base Sepolia
          decimals: 18,
          eip712: {
            name: "Dai Stablecoin",
            version: "1"
          }
        }
      },
      network: "base-sepolia"
    }
  },
  { url: "https://x402.org/facilitator" }
));

app.get("/premium/weth", (req, res) => {
  res.json({ content: "Premium content paid with WETH" });
});

app.get("/premium/dai", (req, res) => {
  res.json({ content: "Premium content paid with DAI" });
});

app.listen(4021);
```

### Method 3: Flexible (Client Preference)

Accept multiple tokens by using the default USDC configuration. The middleware will automatically read the `X-PREFERRED-TOKEN` and `X-PREFERRED-NETWORK` headers from the client and query the facilitator's `/supported` endpoint to verify support:

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();

app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "GET /flexible/*": {
      price: "$0.01", // Default USDC, but accepts other tokens based on client preference
      network: "base-sepolia"
    }
  },
  { url: "https://x402.org/facilitator" }
));

app.get("/flexible/content", (req, res) => {
  res.json({ content: "Flexible payment accepted" });
});

app.listen(4021);
```

**How it works:**
1. Middleware reads `X-PREFERRED-TOKEN` header from client
2. Calls facilitator's `supported()` endpoint to verify token support
3. Updates payment requirements to use preferred token if supported
4. Facilitator handles token swaps automatically (e.g., WETH → USDC via Relay Protocol)
5. Resource server receives USDC settlement

### Complete Multi-Token Example

Combine all three approaches in a single server:

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();

app.use(paymentMiddleware(
  "0xYourAddress",
  {
    // Simple USDC endpoint
    "GET /weather": {
      price: "$0.001",
      network: "base-sepolia"
    },

    // Explicit WETH endpoint
    "GET /premium/weth": {
      price: {
        amount: "100000000000000",
        asset: {
          address: "0x4200000000000000000000000000000000000006",
          decimals: 18,
          eip712: { name: "Wrapped Ether", version: "1" }
        }
      },
      network: "base-sepolia"
    },

    // Explicit DAI endpoint
    "GET /premium/dai": {
      price: {
        amount: "1000000000000000",
        asset: {
          address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
          decimals: 18,
          eip712: { name: "Dai Stablecoin", version: "1" }
        }
      },
      network: "base-sepolia"
    },

    // Cross-chain WETH endpoint
    "GET /premium/eth-weth": {
      price: {
        amount: "100000000000000",
        asset: {
          address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
          decimals: 18,
          eip712: { name: "Wrapped Ether", version: "1" }
        }
      },
      network: "ethereum-sepolia"
    },

    // Flexible endpoint (accepts client preference)
    "GET /flexible/*": {
      price: "$0.01",
      network: "base-sepolia"
    }
  },
  { url: "https://x402.org/facilitator" }
));

// Route handlers
app.get("/weather", (req, res) => {
  res.json({ weather: "sunny", temperature: 70 });
});

app.get("/premium/weth", (req, res) => {
  res.json({ content: "Premium WETH content" });
});

app.get("/premium/dai", (req, res) => {
  res.json({ content: "Premium DAI content" });
});

app.get("/premium/eth-weth", (req, res) => {
  res.json({ content: "Cross-chain WETH content" });
});

app.get("/flexible/content", (req, res) => {
  res.json({ content: "Flexible payment content" });
});

app.listen(4021);
```

### Token Amount Calculation

To calculate the `amount` field for custom tokens:

```
amount = (desired_value) × (10 ** decimals)
```

**Examples:**
- WETH (18 decimals): `0.0001 WETH = 100000000000000`
- DAI (18 decimals): `0.001 DAI = 1000000000000000`
- USDC (6 decimals): `0.001 USDC = 1000`

### Token Swap Flow

When a client pays with a non-native token (e.g., WETH):

1. **Client** sends `X-PREFERRED-TOKEN: WETH` header
2. **Middleware** calls facilitator's `supported()` to verify WETH support
3. **Middleware** updates payment requirements with WETH address
4. **Client** signs payment authorization with WETH
5. **Facilitator** verifies WETH signature
6. **Facilitator** swaps WETH → USDC (via Relay Protocol)
7. **Facilitator** settles USDC to resource server's address

### Example Reference

See complete working example at:
- [`examples/typescript/servers/express/index-multi-token.ts`](./examples/typescript/servers/express/index-multi-token.ts)

---

## Supported Tokens & Networks

### Common ERC-20 Tokens

| Token | Base Sepolia | Ethereum Sepolia | Mainnet Support |
|-------|--------------|------------------|-----------------|
| USDC | Native | Native | ✅ All chains |
| WETH | `0x4200...0006` | `0xfFf9...4d6B14` | ✅ All chains |
| DAI | `0x50c5...DB0Cb` | `0xFF34...8a357` | ✅ Ethereum, Base |

### Requirements for Token Support

Any ERC-20 token can be used if:
1. **Supported by Relay Protocol** for swapping to USDC
2. **Has sufficient liquidity** for the swap amount
3. **Implements ERC-2612 permit** or is USDC (EIP-3009)

### Supported Networks

#### EVM Networks

- `base` / `base-sepolia`
- `ethereum` / `ethereum-sepolia`
- `arbitrum` / `arbitrum-sepolia`
- `optimism` / `optimism-sepolia`
- `polygon` / `polygon-amoy`

### Cross-Chain Support

Clients can pay on **any supported network**, and Anyspend will bridge/swap to the resource server's network via Relay Protocol.

**Example**: Client pays WETH on Ethereum → Anyspend bridges to Base → Resource server receives USDC on Base

---

## HTTP Headers

### Request Headers (Client → Server)

| Header | Description | Example |
|--------|-------------|---------|
| `X-PREFERRED-TOKEN` | Token address to pay with | `0x4200000000000000000000000000000000000006` |
| `X-PREFERRED-NETWORK` | Network/chain to pay on | `base-sepolia` |

These headers are sent in the **initial request** (before 402 response).

### Response Headers (Server → Client)

| Header | Description |
|--------|-------------|
| `X-PAYMENT-RESPONSE` | Base64-encoded payment confirmation with transaction hash |

### Existing X402 Headers

| Header | Direction | Purpose |
|--------|-----------|---------|
| `X-PAYMENT` | Client → Server | Payment signature and authorization |
| `X-PAYMENT-RESPONSE` | Server → Client | Payment confirmation with tx hash |

---

## Fee Structure

### Direct USDC Payment
- **Anyspend Fee**: 0.25% (25 bps)
- **Minimum Fee**: $0.01
- **No swap fees** (direct transfer)

### Multi-Token Payment (with swap)
- **Anyspend Fee**: 0.25% (25 bps)
- **Relay Protocol Fee**: ~0.10% (10 bps)
- **Total Fee**: ~0.35% (35 bps)
- **Minimum Fee**: $0.01

### Cross-Chain Payment (with bridge + swap)
- **Anyspend Fee**: 0.25% (25 bps)
- **Relay Protocol Fee**: ~0.10-0.30% (varies by route)
- **Total Fee**: ~0.35-0.55%
- **Gas costs**: Paid separately on each chain

---

## TypeScript API

### PaymentPreferences Interface

```typescript
/**
 * Payment preference configuration
 */
export interface PaymentPreferences {
  /**
   * Preferred token address to pay with (e.g., WETH, DAI, USDC)
   * If not specified, defaults to USDC
   */
  preferredToken?: string;

  /**
   * Preferred network/chain to pay on
   * If not specified, uses the wallet's current network
   */
  preferredNetwork?: Network;
}
```

### Network Type

```typescript
/**
 * Supported network identifiers
 */
export type Network =
  | "base"
  | "base-sepolia"
  | "ethereum"
  | "ethereum-sepolia"
  | "arbitrum"
  | "arbitrum-sepolia"
  | "optimism"
  | "optimism-sepolia"
  | "polygon"
  | "polygon-amoy";
```

### wrapFetchWithPayment Signature

```typescript
function wrapFetchWithPayment(
  fetch: typeof globalThis.fetch,
  walletClient: Signer | MultiNetworkSigner,
  maxValue?: bigint,                              // Default: 0.1 USDC
  paymentRequirementsSelector?: PaymentRequirementsSelector,
  config?: X402Config,
  preferences?: PaymentPreferences                // NEW: Optional preferences
): (input: RequestInfo, init?: RequestInit) => Promise<Response>
```

### withPaymentInterceptor Signature

```typescript
function withPaymentInterceptor(
  axiosClient: AxiosInstance,
  walletClient: Signer | MultiNetworkSigner,
  paymentRequirementsSelector?: PaymentRequirementsSelector,
  config?: X402Config,
  preferences?: PaymentPreferences                // NEW: Optional preferences
): AxiosInstance
```

---

## Security

All client-side changes maintain existing security properties:

- ✅ **No infinite token approvals** - Clients only sign authorization for exact payment amount
- ✅ **Deadline-based expiry** - Each signature includes deadline (default 5 minutes)
- ✅ **Unique nonce prevents replay** - Each authorization uses unique nonce
- ✅ **EIP-712 typed signatures** - Industry-standard signature method
- ✅ **Server-side validation** - All payments are verified before acceptance

---

## Troubleshooting

### Common Issues

#### Payment amount exceeds maximum
**Solution:**
- Increase `maxValue` parameter in `wrapFetchWithPayment`
- Default is 0.1 USDC equivalent

```typescript
const fetchWithPayment = wrapFetchWithPayment(
  fetch,
  signer,
  BigInt(1 * 10 ** 6), // Allow up to 1 USDC equivalent
  undefined,
  undefined,
  preferences
);
```

#### Token not supported
**Solution:**
- Verify token is supported by Relay Protocol
- Check token has sufficient liquidity for swap
- Ensure token implements ERC-2612 permit or is USDC

#### Cross-chain payment fails
**Solution:**
- Check signer has sufficient balance on source chain
- Verify both source and destination chains are supported
- Ensure enough tokens to cover bridge fees

#### Signature verification fails
**Solution:**
- Check wallet is connected to correct network
- Verify `preferredNetwork` matches signer's network
- Ensure token address is correct for the network

---

## Backward Compatibility

✅ **Fully backward compatible**
- `preferences` parameter is optional
- If not specified, defaults to USDC payment (existing behavior)
- No breaking changes to existing APIs
- Works with any standard X402 resource server

---

## Examples

See complete working examples in:
- [`examples/typescript/clients/fetch/index-with-preferences.ts`](./examples/typescript/clients/fetch/index-with-preferences.ts)
- [`examples/typescript/clients/axios/index-with-preferences.ts`](./examples/typescript/clients/axios/index-with-preferences.ts)

---

## Testing

### Manual Testing

```bash
# Install dependencies
pnpm install

# Run example with default payment (USDC)
cd examples/typescript/clients/fetch
PRIVATE_KEY=0x... RESOURCE_SERVER_URL=... ENDPOINT_PATH=/data npm start

# Run example with payment preferences
npm run start:preferences
```

### Test Scenarios

1. ✅ Default payment with USDC
2. ✅ Payment with WETH on same network
3. ✅ Payment with DAI on same network
4. ✅ Cross-chain payment (Ethereum → Base)
5. ✅ Reusable client with preferences

---

## Benefits

- 🎯 **Pay with preferred token** - Use tokens you already hold
- 🌐 **Cross-chain payments** - Pay on any supported network
- 💰 **Better UX** - No manual swaps needed before payment
- 🔐 **Standard protocol** - Works with any X402 resource server
- ⚡ **Seamless integration** - Simple API with minimal configuration

---

## References

- [X402 Protocol Specification](https://www.x402.org/x402-whitepaper.pdf) - Protocol standard
- [EIP-2612: Permit](https://eips.ethereum.org/EIPS/eip-2612) - Standard token permit
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009) - USDC authorization

---

**Last Updated**: 2025-01-29
**Version**: 1.0.0
