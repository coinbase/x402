# @x402/concordium

Concordium blockchain implementation of the x402 payment protocol using the **Exact** payment scheme with client-broadcast transactions.

## Installation
```bash
npm install @x402/concordium
```

## Overview

This package provides three main components for handling x402 payments on the Concordium blockchain:

- **Client** - For applications that need to make payments (integrates with Concordium wallets)
- **Facilitator** - For payment processors that verify on-chain transactions
- **Server** - For resource servers that accept payments and build payment requirements

## Key Difference from EVM

Unlike EVM which uses EIP-3009 TransferWithAuthorization (signed off-chain, executed by facilitator), Concordium uses a **client-broadcast** flow:

1. Client receives 402 with payment requirements
2. Client creates and broadcasts transaction directly from wallet
3. Client sends payment payload with `txHash` to server
4. Facilitator verifies transaction on-chain (no execution needed)

This means **no signatures in payload** - the transaction is already on-chain when verified.

## Supported Assets

| Type | Symbol | Description | Decimals |
|------|--------|-------------|----------|
| Native | CCD | Native Concordium token | 6 |
| PLT | USDR, EURR, etc. | PLT standard tokens | 6 |


## Package Exports

### Main Package (`@x402/concordium`)

**V2 Protocol Support** - Modern x402 protocol with CAIP-2 network identifiers

**Client:**
- `ExactConcordiumScheme` - V2 client implementation
- `registerExactConcordiumScheme` - Registration helper

**Facilitator:**
- `ExactConcordiumScheme` - V2 facilitator for payment verification
- `ConcordiumClient` - Interface for Concordium node operations
- `ConcordiumTransactionInfo` - Transaction details type

**Server:**
- `ExactConcordiumScheme` - V2 server for building payment requirements

### Subpath Exports
```typescript
// Client
import { ExactConcordiumScheme, registerExactConcordiumScheme } from "@x402/concordium/exact/client";

// Server
import { ExactConcordiumScheme, registerExactConcordiumScheme } from "@x402/concordium/exact/server";

// Facilitator
import { ExactConcordiumScheme, registerExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
import { ConcordiumClient } from "@x402/concordium/client";

// Config
import { getChainConfig, CONCORDIUM_CHAINS } from "@x402/concordium/config";
```

### V1 Package (Legacy)

**Supported V1 Networks:**
```typescript
["concordium", "concordium-testnet"]
```

## Usage Patterns

### 1. Client Setup
```typescript
import { x402Client } from "@x402/core/client";
import { registerExactConcordiumScheme } from "@x402/concordium/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const client = new x402Client();

registerExactConcordiumScheme(client, {
  createAndBroadcastTransaction: async (payTo, amount, asset) => {
    // Integrate with your Concordium wallet (browser extension, SDK, etc.)
    const txHash = await concordiumWallet.sendCCD({
      to: payTo,
      amount: BigInt(amount),
    });
    
    return {
      txHash,
      sender: concordiumWallet.address,
    };
  },
});

// Use with fetch wrapper
const paidFetch = wrapFetchWithPayment(fetch, client);
const response = await paidFetch("https://api.example.com/premium");
```

### 2. Server Setup
```typescript
import { x402HTTPResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactConcordiumScheme } from "@x402/concordium/exact/server";

// Create scheme and register assets
const concordiumScheme = new ExactConcordiumScheme();

// Register PLT tokens (optional - native CCD works by default)
concordiumScheme
  .registerAsset("ccd:*", "EURR", 6)
  .registerAsset("ccd:*", "USDR", 6)

// Define routes
const routes = {
  // Native CCD payment (default when no extra.asset)
  "GET /api/basic": {
    scheme: "exact",
    network: appConfig.concordiumNetwork,
    payTo: appConfig.payTo,
    price: "10", // 10 CCD
    description: "Limited drop merch",
    mimeType: "application/json",
  },

  // PLT token payment (registered asset)
  "GET /api/premium": {
    scheme: "exact",
    network: appConfig.concordiumNetwork,
    payTo: appConfig.payTo,
    price: { amount: "1", asset: "EURR" }, // 1 EURR
    description: "Premium content - 1 EURR",
    mimeType: "application/json",
  },
};

// Create server
const facilitator = new HTTPFacilitatorClient({
  url: "https://your-facilitator.example.com",
});

const server = new x402HTTPResourceServer(facilitator);
server.register("ccd:*", concordiumScheme);

await server.initialize();
```

### 3. Facilitator Setup
```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { registerExactConcordiumScheme } from "@x402/concordium/exact/facilitator";
import { ConcordiumClient } from "@x402/concordium/client";

const client = ConcordiumClient.fromNetwork("concordium-mainnet");

const facilitator = new x402Facilitator();

const scheme = new ExactConcordiumScheme({
  client,
  supportedAssets: CONCORDIUM_ASSETS,
  requireFinalization: true,
  finalizationTimeoutMs: 60000,
});

facilitator.registerScheme("ccd:*", scheme);
```

## Supported Networks

**V2 Networks** (via CAIP-2):

| Network | Identifier |
|---------|------------|
| Mainnet | `ccd:9dd9ca4d19e9393877d2c44b70f89acb` |
| Testnet | `ccd:4221332d34e1694168c2a0c0b3fd0f27` |
| Wildcard | `ccd:*` |

**V1 Networks** (simple names):
- `concordium`
- `concordium-testnet`

## Asset Support

### Native CCD

Default when no `extra.asset` specified:
```typescript
{
  price: "1.0",  // 1 CCD
  // No extra.asset = native CCD
}
```

### PLT Tokens

Register tokens, then reference by symbol:
```typescript
// Server: Register asset
scheme.registerAsset("ccd:*", "USDR", 6);

// Route config: Use by symbol
{
  price: { amount: "1", asset: "EURR" } // 1 EURR
}
```

## Amount Utilities
```typescript
import { toSmallestUnits, fromSmallestUnits } from "@x402/concordium/exact/server";

// Convert human-readable to smallest units
toSmallestUnits("10", 6);      // "10000000"
toSmallestUnits("10.5", 6);    // "10500000"
toSmallestUnits("0.000001", 6); // "1"

// Convert smallest units to human-readable
fromSmallestUnits("10000000", 6);  // "10"
fromSmallestUnits("10500000", 6);  // "10.5"
fromSmallestUnits("1", 6);         // "0.000001"
```

## Payment Flow
```
┌─────────┐      ┌─────────┐      ┌─────────────┐      ┌────────────┐
│  Client │      │  Server │      │ Facilitator │      │ Concordium │
└────┬────┘      └────┬────┘      └──────┬──────┘      └─────┬──────┘
     │                │                   │                   │
     │  1. GET /resource                  │                   │
     │────────────────>                   │                   │
     │                │                   │                   │
     │  2. 402 + PaymentRequirements      │                   │
     │<────────────────                   │                   │
     │                │                   │                   │
     │  3. Broadcast CCD/PLT transfer     │                   │
     │────────────────────────────────────────────────────────>
     │                │                   │                   │
     │  4. txHash returned                │                   │
     │<────────────────────────────────────────────────────────
     │                │                   │                   │
     │  5. Build PaymentPayload:          │                   │
     │     - payload: { txHash, sender }  │                   │
     │     - accepted: { scheme, network, payTo, ... }        │
     │                │                   │                   │
     │  6. GET /resource + X-PAYMENT header                   │
     │────────────────>                   │                   │
     │                │                   │                   │
     │                │  7. verify(payload, requirements)     │
     │                │───────────────────>                   │
     │                │                   │                   │
     │                │  8. VerifyResponse { isValid: true }  │
     │                │<───────────────────                   │
     │                │                   │                   │
     │                │  9. settle(payload, requirements)     │
     │                │───────────────────>                   │
     │                │                   │                   │
     │                │                   │  10. waitForFinalization()
     │                │                   │───────────────────>
     │                │                   │                   │
     │                │                   │  11. TransactionInfo
     │                │                   │<───────────────────
     │                │                   │                   │
     │                │                   │  12. Validate:    │
     │                │                   │      - status     │
     │                │                   │      - sender     │
     │                │                   │      - recipient  │
     │                │                   │      - amount     │
     │                │                   │      - asset      │
     │                │                   │                   │
     │                │  13. SettleResponse { success: true } │
     │                │<───────────────────                   │
     │                │                   │                   │
     │  14. 200 OK + Resource             │                   │
     │<────────────────                   │                   │
```

## API Reference

### ConcordiumClient
```typescript
import { ConcordiumClient } from "@x402/concordium/client";

const client = ConcordiumClient.fromNetwork("concordium-mainnet");
// or
const client = new ConcordiumClient({
  host: "grpc.mainnet.concordium.com",
  port: 20000,
  useTls: true,
});

// Methods
await client.getTransactionStatus(txHash);
await client.waitForFinalization(txHash, timeoutMs);
await client.verifyPayment(txHash, { recipient, minAmount });
await client.invokeContract(contract, method, params);
```

### ExactConcordiumScheme (Server)
```typescript
import { ExactConcordiumScheme } from "@x402/concordium/exact/server";

const scheme = new ExactConcordiumScheme();

// Register PLT token
scheme.registerAsset(network, symbol, decimals);

// Get registered asset
scheme.getAsset(network, symbol);

// Get all supported assets
scheme.getSupportedAssets(network);

// Parse price amount
scheme.parseAssetAmount(price, network);
```

### ExactConcordiumScheme (Facilitator)
```typescript
import { ExactConcordiumScheme } from "@x402/concordium/exact/facilitator";

const scheme = new ExactConcordiumScheme({
  client: ConcordiumClient,
  requireFinalization?: boolean,   // default: true
  finalizationTimeoutMs?: number,  // default: 60000
  supportedAssets?: Array,
});

// Methods (called by facilitator)
await scheme.verify(payload, requirements);
await scheme.settle(payload, requirements);
```

## Chain Configuration

Access chain metadata:
```typescript
import { getChainConfig, CONCORDIUM_MAINNET, CONCORDIUM_TESTNET } from "@x402/concordium/config";

const config = getChainConfig("concordium-testnet");
// {
//   name: "Concordium Testnet",
//   network: "ccd:4221332d34e1694168c2a0c0b3fd0f27",
//   v1Network: "concordium-testnet",
//   grpcUrl: "grpc.testnet.concordium.com:20000",
//   explorerUrl: "https://ccdexplorer.io/",
//   decimals: 6,
//   ...
// }
```

### Types
```typescript
// Transaction info from client
interface TransactionInfo {
  txHash: string;
  status: "pending" | "committed" | "finalized" | "failed";
  sender: string;
  recipient?: string;
  amount?: string;
  asset?: string; // "" for CCD, token symbol for PLT (e.g., "EURR")
}

// Payment payload (V2)
interface ExactConcordiumPayloadV2 {
  txHash: string;
  sender: string;
  asset?: string;  // "" for CCD, "USDR" for PLT
}
```

## Error Handling
```typescript
// Unknown asset
Error: Unknown asset "UNKNOWN". Registered: CCD, USDR, EURR

// USD price not supported
Error: USD prices not supported. Got: $1.00

// Invalid amount
Error: Invalid amount: abc

// Transaction errors (facilitator)
// - missing_tx_hash
// - missing_sender
// - transaction_not_found
// - transaction_failed
// - transaction_pending
// - transaction_not_finalized
// - sender_mismatch
// - recipient_mismatch
// - insufficient_amount
// - asset_mismatch
// - finalization_timeout
// - finalization_failed
```

## Development
```bash
# Build
npm run build

# Test
npm run test

# Lint & Format
npm run lint
npm run format
```

## File Structure
```
@x402/concordium/
├── index.ts
├── types.ts
├── client/
│   ├── concordium.client.ts
│   └── index.ts
├── config/
│   ├── chains.ts
│   ├── tokens.ts
│   └── index.ts
├── exact/
|   ├── client/
│   │   ├── scheme.ts
│   │   └── index.ts
│   ├── server/
│   │   ├── scheme.ts      # Price parsing, asset registration
│   │   └── index.ts
│   ├── facilitator/
│   │   ├── scheme.ts      # Transaction verification
│   │   └── index.ts
│   └── v1/
│       └── facilitator/
│           ├── scheme.ts  # V1 legacy support
│           └── index.ts
└── utils/
```

## Related Packages

- `@x402/core` - Core protocol types and client
- `@x402/fetch` - HTTP wrapper with automatic payment handling