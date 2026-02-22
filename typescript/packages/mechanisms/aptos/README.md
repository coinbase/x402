# @x402/aptos

Aptos implementation of the x402 payment protocol using the **Exact** payment scheme with fungible asset transfers.

## Installation

```bash
npm install @x402/aptos
```

## Overview

This package provides three main components for handling x402 payments on Aptos:

- **Client** - For applications that need to make payments (have wallets/signers)
- **Facilitator** - For payment processors that verify and execute on-chain transactions
- **Service** - For resource servers that accept payments and build payment requirements

## Package Exports

### Main Package (`@x402/aptos`)

**V2 Protocol Support** - Modern x402 protocol with CAIP-2 network identifiers

**Client:**

- `ExactAptosClient` - V2 client implementation using fungible asset transfers
- `toClientAptosSigner(account)` - Converts Aptos accounts to x402 signers
- `ClientAptosSigner` - TypeScript type for client signers
- `ClientAptosConfig` - Optional RPC configuration

**Facilitator:**

- `ExactAptosFacilitator` - V2 facilitator for payment verification and settlement
- `toFacilitatorAptosSigner(account)` - Converts Aptos accounts to facilitator signers
- `FacilitatorAptosSigner` - TypeScript type for facilitator signers
- `FacilitatorRpcClient` - RPC client interface

**Service:**

- `ExactAptosServer` - V2 service for building payment requirements

**Utilities:**

- Network validation, asset info lookup, amount formatting, transaction encoding

### Client Builder (`@x402/aptos/client`)

**Convenience builder** for creating fully-configured Aptos clients

**Exports:**

- `createAptosClient(config)` - Creates x402Client with Aptos support
- `AptosClientConfig` - Configuration interface

**What it does:**

- Automatically registers V2 wildcard scheme (`aptos:*`)
- Optionally applies payment policies
- Optionally uses custom payment selector

**Example:**

```typescript
import { createAptosClient } from "@x402/aptos/client";
import { toClientAptosSigner } from "@x402/aptos";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

const privateKey = new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY);
const account = Account.fromPrivateKey({ privateKey });
const signer = toClientAptosSigner(account);

const client = createAptosClient({ signer });
// Ready to use!
```

## Usage Patterns

### 1. Using Pre-built Builder (Recommended)

```typescript
import { createAptosClient } from "@x402/aptos/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

// Create signer from private key
const privateKey = new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY);
const account = Account.fromPrivateKey({ privateKey });
const signer = toClientAptosSigner(account);

// Create client with automatic Aptos support
const client = createAptosClient({ signer });
const paidFetch = wrapFetchWithPayment(fetch, client);

// Make payment-protected requests
const response = await paidFetch("https://api.example.com/premium-data");
```

### 2. Direct Registration (Full Control)

```typescript
import { x402Client } from "@x402/core/client";
import { ExactAptosClient } from "@x402/aptos";
import { toClientAptosSigner } from "@x402/aptos";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

const privateKey = new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY);
const account = Account.fromPrivateKey({ privateKey });
const signer = toClientAptosSigner(account);

const client = new x402Client().register("aptos:*", new ExactAptosClient(signer));

// Or register for specific networks
client.register("aptos:1", new ExactAptosClient(signer)); // Mainnet
client.register("aptos:2", new ExactAptosClient(signer)); // Testnet
```

### 3. Server-Side Payment Requirements

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { ExactAptosServer } from "@x402/aptos/exact/server";
import express from "express";

// Create and configure server
const server = new x402ResourceServer({
  facilitatorUrl: "https://facilitator.x402.org",
});
server.register("aptos:*", new ExactAptosServer());

// Set up Express middleware
const app = express();
app.use(
  "/api",
  server.middleware({
    "GET /premium-data": {
      accepts: [
        {
          scheme: "aptos",
          network: "aptos:1", // Mainnet
          price: "$0.10", // Auto-converts to USDC
          payTo: "0x742d35cc6634c0532925a3b8d0ad3639c4c9a9a4ed1d9a3c22ab3b9a94e2c7e5",
        },
      ],
    },
  }),
);

app.get("/api/premium-data", (req, res) => {
  res.json({ data: "This content requires payment!" });
});
```

### 4. Facilitator Implementation

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactAptosFacilitator } from "@x402/aptos/exact/facilitator";
import { toFacilitatorAptosSigner } from "@x402/aptos";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

// Create facilitator signer
const privateKey = new Ed25519PrivateKey(process.env.FACILITATOR_PRIVATE_KEY);
const account = Account.fromPrivateKey({ privateKey });
const signer = toFacilitatorAptosSigner(account);

// Create and configure facilitator
const facilitator = new x402Facilitator();
facilitator.register("aptos:*", new ExactAptosFacilitator(signer));

// Start facilitator server
const server = express();
server.use("/", facilitator.middleware());
server.listen(3001);
```

## Supported Networks

**V2 Networks** (via CAIP-2):

- `aptos:1` - Mainnet
- `aptos:2` - Testnet
- `aptos:*` - Wildcard (matches all Aptos networks)

## Asset Support

Supports Aptos fungible assets (FA) and coins:

- **USDC** (primary) - `0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC`
- **APT** - `0x1::aptos_coin::AptosCoin`
- Any registered fungible asset or coin type
- Automatic detection of asset type (FA vs Coin)

## Transaction Structure

The exact payment scheme uses Aptos's native transfer functions:

- `primary_fungible_store::transfer` for fungible assets
- `coin::transfer` for coin types
- **Sponsored transactions** - Facilitators can pay gas fees on behalf of clients
- Partial signing (client signs, facilitator sponsors and submits)

## Pricing Examples

The Aptos implementation supports flexible pricing formats:

```typescript
// String format (auto-converts to USDC)
price: "$1.00"        // 1,000,000 USDC (6 decimals)
price: "$0.10"        // 100,000 USDC

// Object format (explicit asset)
price: {
  amount: "1000000",  // 1 USDC (6 decimals)
  asset: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC"
}

// APT payments
price: {
  amount: "100000000", // 1 APT (8 decimals)
  asset: "0x1::aptos_coin::AptosCoin"
}
```

## Configuration Options

### Client Configuration

```typescript
import { createAptosClient } from "@x402/aptos/client";

const client = createAptosClient({
  signer: myAptosSigner,
  rpcConfig: {
    // Custom RPC endpoint
    nodeUrl: "https://fullnode.mainnet.aptoslabs.com/v1",
    // Connection timeout
    timeout: 30000,
    // Custom headers
    headers: {
      "X-API-Key": "your-api-key",
    },
  },
  // Payment policies
  policies: [
    // Maximum payment per transaction
    { type: "maxAmount", asset: "USDC", amount: "10000000" }, // $10
    // Daily spending limit
    { type: "dailyLimit", asset: "USDC", amount: "100000000" }, // $100
  ],
});
```

### Server Configuration

```typescript
const server = new x402ResourceServer({
  facilitatorUrl: "https://facilitator.x402.org",
  // Custom timeout for facilitator requests
  timeout: 10000,
  // Enable request logging
  debug: true,
});
```

## Error Handling

Common error scenarios and how to handle them:

```typescript
import { createAptosClient } from "@x402/aptos/client";
import { X402Error } from "@x402/core";

const client = createAptosClient({ signer });

try {
  const response = await paidFetch("https://api.example.com/data");
} catch (error) {
  if (error instanceof X402Error) {
    switch (error.type) {
      case "INSUFFICIENT_FUNDS":
        console.log("Need more USDC for payment");
        break;
      case "NETWORK_ERROR":
        console.log("Network connection failed");
        break;
      case "PAYMENT_FAILED":
        console.log("Payment transaction failed:", error.message);
        break;
      case "FACILITATOR_ERROR":
        console.log("Facilitator rejected payment:", error.message);
        break;
      default:
        console.log("Payment error:", error.message);
    }
  }
}
```

## Testnet Resources

For testing on Aptos testnet, you can obtain test tokens from these faucets:

- **Test APT**: https://aptos.dev/network/faucet
- **Test USDC**: https://faucet.circle.com/ (select Aptos Testnet)
- **Alternative APT faucet**: Use the Aptos CLI: `aptos account fund-with-faucet --account <address>`

### Testnet Setup Example

```typescript
import { Account, Ed25519PrivateKey, Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { createAptosClient } from "@x402/aptos/client";

// Generate new account for testing
const privateKey = new Ed25519PrivateKey("0x...");
const account = Account.fromPrivateKey({ privateKey });

// Fund account with testnet APT
const config = new AptosConfig({ network: Network.TESTNET });
const aptos = new Aptos(config);
await aptos.fundAccount({ accountAddress: account.accountAddress, amount: 100000000 });

// Create client for testnet
const signer = toClientAptosSigner(account);
const client = createAptosClient({ signer });

// Register for testnet specifically
client.register("aptos:2", new ExactAptosClient(signer));
```

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Integration tests (requires testnet setup)
pnpm test:integration

# Lint & Format
pnpm lint
pnpm format
```

## Migration from EVM

If you're migrating from EVM-based x402 implementations:

```typescript
// EVM (old)
import { createEvmClient } from "@x402/evm/client";
const client = createEvmClient({ signer: evmSigner });

// Aptos (new)
import { createAptosClient } from "@x402/aptos/client";
const client = createAptosClient({ signer: aptosSigner });

// Same API, different signers!
const response = await paidFetch("https://api.example.com/data");
```

**Key differences:**

- **90% lower transaction fees** on Aptos vs Ethereum mainnet
- **Faster finality** (~2-3 seconds vs 12+ seconds)
- **Sponsored transactions** - facilitators can pay gas for users
- **Native fungible asset support** vs ERC-20 complexity

## Related Packages

- `@x402/core` - Core protocol types and client
- `@x402/fetch` - HTTP wrapper with automatic payment handling
- `@x402/evm` - EVM/Ethereum implementation
- `@x402/svm` - Solana implementation
- `@aptos-labs/ts-sdk` - Aptos TypeScript SDK (peer dependency)

## License

Apache-2.0
