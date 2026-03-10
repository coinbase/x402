# @x402/avm

AVM (Algorand Virtual Machine) implementation of the x402 payment protocol using the **Exact** payment scheme with ASA (Algorand Standard Asset) transfers.

## Installation

```bash
npm install @x402/avm
```

## Overview

This package provides three main components for handling x402 payments on Algorand:

- **Client** - For applications that need to make payments (have wallets/signers)
- **Facilitator** - For payment processors that verify and execute on-chain transactions
- **Service** - For resource servers that accept payments and build payment requirements

## Package Exports

### Main Package (`@x402/avm`)

**V2 Protocol Support** - Modern x402 protocol with CAIP-2 network identifiers

**Client:**
- `ExactAvmClient` - V2 client implementation using ASA transfers
- `ClientAvmSigner` - TypeScript interface for client signers (implement with `@algorandfoundation/algokit-utils`)

**Facilitator:**
- `ExactAvmFacilitator` - V2 facilitator for payment verification and settlement
- `FacilitatorAvmSigner` - TypeScript interface for facilitator signers (implement with `@algorandfoundation/algokit-utils`)

**Service:**
- `ExactAvmServer` - V2 service for building payment requirements

### V1 Package (`@x402/avm/v1`)

**V1 Protocol Support** - Legacy x402 protocol with simple network names

**Exports:**
- `ExactAvmClientV1` - V1 client implementation
- `ExactAvmFacilitatorV1` - V1 facilitator implementation
- `NETWORKS` - Array of all supported V1 network names

**Supported V1 Networks:**
```typescript
[
  "algorand-mainnet",  // Mainnet
  "algorand-testnet"   // Testnet
]
```

## Version Differences

### V2 (Main Package)
- Network format: CAIP-2 (`algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k`)
- Wildcard support: Yes (`algorand:*`)
- Payload structure: Partial (core wraps with metadata)
- Extensions: Full support
- Transaction: Atomic group with optional fee payer

### V1 (V1 Package)
- Network format: Simple names (`algorand-testnet`)
- Wildcard support: No (fixed list)
- Payload structure: Complete
- Extensions: Limited
- Transaction: Atomic group with optional fee payer

## Usage Patterns

### 1. Direct Registration

```typescript
import { x402Client } from "@x402/core/client";
import { ExactAvmClient } from "@x402/avm";
import { ExactAvmClientV1 } from "@x402/avm/v1";

const client = new x402Client()
  .register("algorand:*", new ExactAvmClient(signer))
  .registerSchemeV1("algorand-testnet", new ExactAvmClientV1(signer))
  .registerSchemeV1("algorand-mainnet", new ExactAvmClientV1(signer));
```

### 2. Using Config (Flexible)

```typescript
import { x402Client } from "@x402/core/client";
import { ExactAvmClient } from "@x402/avm";

const client = x402Client.fromConfig({
  schemes: [
    { network: "algorand:*", client: new ExactAvmClient(signer) },
    {
      network: "algorand-testnet",
      client: new ExactAvmClientV1(signer),
      x402Version: 1
    }
  ]
});
```

## Supported Networks

**V2 Networks** (via CAIP-2):
- `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k` - Mainnet
- `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe` - Testnet
- `algorand:*` - Wildcard (matches all Algorand networks)

**V1 Networks** (simple names):
- `algorand-mainnet` - Mainnet
- `algorand-testnet` - Testnet

## Signer Implementation

This package exports `ClientAvmSigner` and `FacilitatorAvmSigner` as TypeScript interfaces. You implement them directly using `@algorandfoundation/algokit-utils`:

### Client Signer

```typescript
import { encodeAddress } from "@algorandfoundation/algokit-utils/common";
import { ed25519Generator } from "@algorandfoundation/algokit-utils/crypto";
import { decodeTransaction, bytesForSigning, encodeSignedTransaction } from "@algorandfoundation/algokit-utils/transact";

// Decode Base64 private key (64 bytes: 32-byte seed + 32-byte public key)
const secretKey = Buffer.from(process.env.AVM_PRIVATE_KEY!, "base64");
const seed = secretKey.slice(0, 32);
const { ed25519Pubkey, rawEd25519Signer } = ed25519Generator(seed);
const address = encodeAddress(ed25519Pubkey);

const avmSigner: ClientAvmSigner = {
  address,
  signTransactions: async (txns: Uint8Array[], indexesToSign?: number[]) => {
    return Promise.all(txns.map(async (txn, i) => {
      if (indexesToSign && !indexesToSign.includes(i)) return null;
      const decoded = decodeTransaction(txn);
      const sig = await rawEd25519Signer(bytesForSigning.transaction(decoded));
      return encodeSignedTransaction({ txn: decoded, sig });
    }));
  },
};
```

### Facilitator Signer

See [facilitator example](../../examples/typescript/facilitator/) for a full `FacilitatorAvmSigner` implementation.

## Environment Variables

### Client Applications

Applications that make payments using an Algorand wallet.

| Variable | Required | Description |
|----------|----------|-------------|
| `AVM_PRIVATE_KEY` | Yes | Base64-encoded 64-byte Algorand private key (32-byte seed + 32-byte public key). Used to sign payment transactions. |
| `ALGOD_TESTNET_URL` | No | Custom Algorand Testnet API endpoint. Defaults to `https://testnet-api.algonode.cloud`. |
| `ALGOD_MAINNET_URL` | No | Custom Algorand Mainnet API endpoint. Defaults to `https://mainnet-api.algonode.cloud`. |

### Server (Resource Provider)

Servers that accept payments and build payment requirements.

| Variable | Required | Description |
|----------|----------|-------------|
| `AVM_ADDRESS` | Yes | Algorand wallet address to receive payments (58-character base32 address). |

### Facilitator

Payment processors that verify and settle transactions on-chain.

| Variable | Required | Description |
|----------|----------|-------------|
| `AVM_PRIVATE_KEY` | Yes | Base64-encoded 64-byte Algorand private key. Used to submit settlement transactions and pay fees. |
| `ALGOD_SERVER` | No | Custom Algod HTTP server URL for direct node access. Defaults to AlgoNode testnet. |
| `ALGOD_TOKEN` | No | Algod API authentication token. Not needed when using AlgoNode public endpoints. |
| `ALGOD_TESTNET_URL` | No | Custom Algorand Testnet API endpoint. Defaults to `https://testnet-api.algonode.cloud`. |
| `ALGOD_MAINNET_URL` | No | Custom Algorand Mainnet API endpoint. Defaults to `https://mainnet-api.algonode.cloud`. |

### Key Format

The `AVM_PRIVATE_KEY` is a Base64-encoded string containing a 64-byte Algorand private key:
- First 32 bytes: Ed25519 seed (signing key)
- Last 32 bytes: Ed25519 public key

To derive the Algorand address from the private key:

```typescript
import { encodeAddress } from "@algorandfoundation/algokit-utils/common";
import { ed25519Generator } from "@algorandfoundation/algokit-utils/crypto";
const secretKey = Buffer.from(process.env.AVM_PRIVATE_KEY!, "base64");
const seed = secretKey.slice(0, 32);
const { ed25519Pubkey } = ed25519Generator(seed);
const address = encodeAddress(ed25519Pubkey);
```

### Algod Node Defaults

When `ALGOD_TESTNET_URL` and `ALGOD_MAINNET_URL` are not set, the SDK defaults to [AlgoNode](https://algonode.io/) public endpoints which are free, require no authentication, and support both Testnet and Mainnet.

## Asset Support

Supports Algorand Standard Assets (ASA):
- USDC (primary)
- Any ASA with proper opt-in

## Transaction Structure

The exact payment scheme uses atomic transaction groups with:
- Payment transaction (ASA transfer or ALGO payment)
- Optional fee payer transaction (gasless transactions)
- Transaction simulation for validation

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Integration tests
pnpm test:integration

# Lint & Format
pnpm lint
pnpm format
```

## Related Packages

- `@x402/core` - Core protocol types and client
- `@x402/fetch` - HTTP wrapper with automatic payment handling
- `@x402/evm` - EVM/Ethereum implementation
- `@x402/svm` - Solana/SVM implementation
- `@algorandfoundation/algokit-utils` - Algorand utility library (dependency)
