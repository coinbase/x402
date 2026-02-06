# @x402/xrp

XRP (Ripple Ledger) implementation of the x402 payment protocol using the **Exact** payment scheme with native XRP Payment transactions.

## Installation

```bash
npm install @x402/xrp
```

## Overview

This package provides three main components for handling x402 payments on the XRP Ledger:

- **Client** - For applications that need to make payments (have wallets/signers)
- **Facilitator** - For payment processors that verify and submit transactions to XRPL
- **Service** - For resource servers that accept payments and build payment requirements

## Package Exports

### Main Package (@x402/xrp)

**V2 Protocol Support** - Modern x402 protocol with CAIP-2 network identifiers

- **Client:**
  - `ExactXrpScheme` - V2 client implementation
  - `toClientXrpSigner(wallet)` - Converts XRPL Wallet to x402 signer
  - `ClientXrpSigner` - TypeScript type for client signers

- **Facilitator:**
  - `ExactXrpScheme` - V2 facilitator for payment verification and settlement
  - `FacilitatorXrpClient` - XRPL client wrapper for facilitators
  - `toFacilitatorXrpSigner(client)` - Converts client to facilitator signer
  - `FacilitatorXrpSigner` - TypeScript type for facilitator signers

- **Server:**
  - `ExactXrpScheme` - V2 service for building payment requirements

### Client Builder (@x402/xrp/exact/client)

**Convenience builder** for creating fully-configured XRP clients

- **Exports:**
  - `createXrpClient(config)` - Creates x402Client with XRP support
  - `XrpClientConfig` - Configuration interface

- **Example:**
  ```typescript
  import { createXrpClient } from "@x402/xrp/exact/client";
  import { toClientXrpSigner } from "@x402/xrp";
  import { Wallet } from "xrpl";

  const wallet = Wallet.fromSeed("sn3nxiW7v8KXzPzAqzwHXhSSKNyN");
  const signer = toClientXrpSigner(wallet);
  const client = createXrpClient({ signer });

  // Ready to make XRP payments via x402!
  ```

### Server (@x402/xrp/exact/server)

**Server-side payment requirements** for resource servers

- **Exports:**
  - `ExactXrpScheme` - Server implementation
  - `registerExactXrpScheme(config)` - Server registration helper

### Facilitator (@x402/xrp/exact/facilitator)

**Payment verification and settlement** for facilitators

- **Exports:**
  - `ExactXrpScheme` - Facilitator implementation
  - `registerExactXrpScheme(config)` - Facilitator registration helper

## Supported Networks

**V2 Networks** (via CAIP-2):
- `xrp:mainnet` - XRP Mainnet
- `xrp:testnet` - XRP Testnet
- `xrp:devnet` - XRP Devnet
- `xrp:*` - Wildcard (matches all XRP networks)

## Key Differences from EVM

| Feature | EVM | XRP |
|---------|-----|-----|
| **Transfer Method** | Smart contracts (EIP-3009/Permit2) | Native Payment transaction |
| **Signature** | ECDSA (secp256k1) | secp256k1 or ed25519 (we use secp256k1) |
| **Replay Protection** | Nonce | Account Sequence |
| **Fees** | Paid to validators (gas) | Destroyed (burned) |
| **Minimum Balance** | None | 1-10 XRP base reserve |
| **Destination Tag** | N/A | Numeric recipient identifier |

## Usage Patterns

### 1. Client Making a Payment

```typescript
import { createXrpClient } from "@x402/xrp/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const wallet = Wallet.fromSeed(process.env.XRP_SEED);
const client = createXrpClient({
  signer: toClientXrpSigner(wallet),
  serverUrl: "wss://testnet.xrpl-labs.com"
});

const paidFetch = wrapFetchWithPayment(fetch, client);

// This will automatically request and pay for the resource
const response = await paidFetch("https://api.example.com/premium-data");
const data = await response.json();
```

### 2. Server Requesting Payment

```typescript
import { registerExactXrpScheme } from "@x402/xrp/exact/server";
import { x402Middleware } from "@x402/express";

const server = registerExactXrpScheme();

// Build payment requirements for 0.01 XRP on testnet
const requirements = await server.buildRequirements({
  network: "xrp:testnet",
  amount: "$0.01", // Automatically converted to drops
  payTo: "rYourAddressHere...",
  extra: {
    destinationTag: 12345, // Optional
  },
});
```

### 3. Facilitator Verifying and Settling

```typescript
import { registerExactXrpScheme } from "@x402/xrp/exact/facilitator";
import { FacilitatorXrpClient, toFacilitatorXrpSigner } from "@x402/xrp";

const xrpClient = new FacilitatorXrpClient({
  server: "wss://testnet.xrpl-labs.com",
});
await xrpClient.connect();
xrpClient.addAddress("rYourFacilitatorAddress...");

const facilitator = registerExactXrpScheme({
  signer: toFacilitatorXrpSigner(xrpClient),
});

// Verify payment from incoming request
const verifyResult = await facilitator.verify(paymentPayload, requirements);
if (verifyResult.isValid) {
  // Settle the payment
  const settleResult = await facilitator.settle(paymentPayload, requirements);
}
```

## Transaction Structure

X402 XRP payments use the native XRP Payment transaction type:

```json
{
  "TransactionType": "Payment",
  "Account": "rSenderAddress...",
  "Destination": "rRecipientAddress...",
  "Amount": "10000", // Drops (0.01 XRP)
  "Fee": "12", // Drops
  "Sequence": 42,
  "LastLedgerSequence": 9000000,
  "DestinationTag": 12345,
  "Memos": [{
    "Memo": {
      "MemoType": "x402_payment",
      "MemoData": "ref-data..."
    }
  }]
}
```

## Fees

XRP transaction fees are:
- Very low: typically 0.000012 XRP (12 drops) per transaction
- Destroyed (burned), not paid to validators or facilitators
- Paid by the facilitator when submitting, but the client controls the amount in the signed transaction

## Destination Tags

XRP uses destination tags to identify recipients when sharing addresses:

```typescript
const requirements = await server.buildRequirements({
  network: "xrp:testnet",
  amount: "10000",
  payTo: "rExchangeHotWallet...",
  extra: {
    destinationTag: 1234567890, // Your account ID at the exchange
  },
});
```

## X-addresses

The XRPL supports X-address format which encodes both the address and destination tag:
- Example: `X7m1kaW4K3RWMnSWEtTH4gyAYYqR9hT8hC`

You can use `xrpl` library's `xAddressToClassicAddress()` to convert as needed.

## Funding Testnet Wallets

For development, you can fund testnet wallets at:
- https://test.bithomp.com/
- https://test.xrpl.org/

Or use the XRPL Testnet Faucet API.

## Development

```bash
# Build
npm run build

# Test
npm run test

# Integration tests (requires testnet connection)
npm run test:integration

# Lint & Format
npm run lint
npm run format
```

## Related Packages

- `@x402/core` - Core protocol types and client
- `@x402/fetch` - HTTP wrapper with automatic payment handling
- `@x402/evm` - EVM implementation
- `xrpl` - Official XRPL JavaScript library

## More Information

- [x402 Protocol](https://x402.org/)
- [XRP Ledger Documentation](https://xrpl.org/)
- [XRPL.js Library](https://js.xrpl.org/)
