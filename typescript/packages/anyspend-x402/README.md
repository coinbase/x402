# @b3dotfun/anyspend-x402

[![npm version](https://img.shields.io/npm/v/@b3dotfun/anyspend-x402.svg)](https://www.npmjs.com/package/@b3dotfun/anyspend-x402)
[![npm downloads](https://img.shields.io/npm/dm/@b3dotfun/anyspend-x402.svg)](https://www.npmjs.com/package/@b3dotfun/anyspend-x402)
[![License](https://img.shields.io/npm/l/@b3dotfun/anyspend-x402.svg)](https://github.com/b3-fun/anyspend-x402/blob/main/LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-b3--fun%2Fanyspend--x402-blue)](https://github.com/b3-fun/anyspend-x402)

AnySpend implementation of the x402 Payment Protocol. This package provides facilitator access for the x402 protocol, enabling payment verification and settlement.

**🌐 Facilitator URL**: `https://mainnet.anyspend.com/x402`

Based on the original [@coinbase/x402](https://www.npmjs.com/package/@coinbase/x402) package with extended functionality.

## What Makes AnySpend x402 Special?

Unlike standard x402 implementations, AnySpend x402 enables:

- ✨ **Multi-token payments** - Pay with various supported ERC-20 tokens
- 🌉 **Cross-chain payments** - Pay on one network, settle on another
- 🔄 **Automatic conversion** - Token swaps handled seamlessly
- 🎯 **Standard compatibility** - Works with any x402 client (no AnySpend-specific code needed)

## Installation

```bash
npm install @b3dotfun/anyspend-x402
```

## Features

- ✅ Pre-configured facilitator for x402 payments
- ✅ Support for Coinbase Developer Platform (CDP) integration
- ✅ Multi-token and cross-chain payment support
- ✅ TypeScript-first with full type definitions

## Quick Start

```typescript
import { facilitator } from "@b3dotfun/anyspend-x402";
import { paymentMiddleware } from "x402-express";

// Use the pre-configured facilitator in your x402 integration
app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/protected": {
      price: "$0.10",
      network: "base-sepolia"
    }
  },
  facilitator
));
```

## Integration Examples

### With Express Middleware

```typescript
import express from "express";
import { paymentMiddleware } from "x402-express";
import { facilitator } from "@b3dotfun/anyspend-x402";

const app = express();

app.use(paymentMiddleware(
  "0xYourAddress",
  {
    "/protected": {
      price: "$0.10",
      network: "base-sepolia"
    }
  },
  facilitator
));
```

### With Hono

```typescript
import { Hono } from "hono";
import { paymentMiddleware } from "x402-hono";
import { facilitator } from "@b3dotfun/anyspend-x402";

const app = new Hono();

app.use("*", paymentMiddleware(
  "0xYourAddress",
  {
    "/api/*": {
      price: "$0.01",
      network: "base-sepolia"
    }
  },
  facilitator
));
```

### With Next.js

```typescript
import { paymentMiddleware } from "x402-next";
import { facilitator } from "@b3dotfun/anyspend-x402";

export default paymentMiddleware(
  handler,
  "0xYourAddress",
  { price: "$0.05", network: "base-sepolia" },
  facilitator
);
```

## API Reference

### `facilitator`

Pre-configured facilitator instance connected to `https://mainnet.anyspend.com/x402`.

```typescript
import { facilitator } from "@b3dotfun/anyspend-x402";

// Use directly with x402 middleware
app.use(paymentMiddleware("0xYourAddress", routes, facilitator));
```

### `createFacilitatorConfig(apiKeyId?, apiKeySecret?)`

Creates a custom facilitator configuration with optional authentication.

**Returns:** `FacilitatorConfig` object compatible with x402 middleware

```typescript
import { createFacilitatorConfig } from "@b3dotfun/anyspend-x402";

const customFacilitator = createFacilitatorConfig();
```

## Facilitator Endpoints

The AnySpend facilitator is hosted at **`https://mainnet.anyspend.com/x402`**

Standard x402 endpoints:
- `POST /verify` - Verify payment signatures
- `POST /settle` - Settle payments on-chain
- `GET /supported` - List supported networks and tokens

## How It Works

AnySpend x402 extends the standard protocol to support flexible payment options:

1. **Client** makes request to resource server
2. **Server** responds with 402 Payment Required
3. **Client** signs payment with supported token
4. **Facilitator** handles verification and settlement
5. **Resource server** receives USDC

### Key Benefits

✅ **Standard x402 protocol** - no custom integration needed
✅ **Flexible payment options** - support for multiple tokens
✅ **Automatic handling** - facilitator manages the complexity
✅ **Cross-chain support** - payments across different networks

## Supported Networks

- Base / Base Sepolia
- Ethereum / Ethereum Sepolia
- Arbitrum / Arbitrum Sepolia
- Optimism / Optimism Sepolia
- Polygon / Polygon Amoy

**Primary Token**: USDC across all supported networks

For the latest list of supported tokens and networks, query the `/supported` endpoint at `https://mainnet.anyspend.com/x402/supported`

## About x402

The x402 protocol is an open standard for HTTP-native payments. It enables:

- **Low fees**: No percentage-based fees, just network costs
- **Instant settlement**: ~2 second finality on supported networks
- **Micro-payments**: Accept payments as low as $0.001
- **Chain agnostic**: Works across multiple blockchain networks
- **Easy integration**: One line of code for servers, one function for clients

Learn more at [x402.org](https://x402.org)

## Related Packages

- [x402](https://www.npmjs.com/package/x402) - Core x402 protocol implementation
- [x402-express](https://www.npmjs.com/package/x402-express) - Express.js middleware
- [x402-hono](https://www.npmjs.com/package/x402-hono) - Hono middleware
- [x402-next](https://www.npmjs.com/package/x402-next) - Next.js middleware
- [x402-fetch](https://www.npmjs.com/package/x402-fetch) - Client for Fetch API
- [x402-axios](https://www.npmjs.com/package/x402-axios) - Client for Axios

## Contributing

Contributions are welcome! This is a fork of the original Coinbase x402 implementation with extensions for the AnySpend ecosystem.

## License

Apache-2.0

## Advanced Features

For advanced usage including:
- Multi-token payment integration
- Cross-chain payment flows
- Client-side implementation with payment preferences
- Server-side token acceptance configuration

See the complete [AnySpend Integration Guide](https://github.com/b3-fun/anyspend-x402/blob/main/ANYSPEND-INTEGRATION.md)

## Resources

### Documentation
- **x402 Protocol**: [x402.org/docs](https://x402.org/docs)
- **Integration Guide**: [ANYSPEND-INTEGRATION.md](https://github.com/b3-fun/anyspend-x402/blob/main/ANYSPEND-INTEGRATION.md)
- **Technical Design**: [TDD Document](https://github.com/b3-fun/anyspend-x402/blob/main/anyspend-docs/ANYSPEND_X402_TDD.md)

### Links
- **npm Package**: [@b3dotfun/anyspend-x402](https://www.npmjs.com/package/@b3dotfun/anyspend-x402)
- **GitHub**: [b3-fun/anyspend-x402](https://github.com/b3-fun/anyspend-x402)
- **Issues**: [Report bugs](https://github.com/b3-fun/anyspend-x402/issues)
- **Facilitator**: https://mainnet.anyspend.com/x402

### Community
- **Upstream**: [coinbase/x402](https://github.com/coinbase/x402)
- **x402 Website**: [x402.org](https://x402.org)
