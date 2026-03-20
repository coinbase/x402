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

## Usage

```typescript
import { x402Client } from "@x402/core/client";
import { ExactAvmClient } from "@x402/avm";

const client = new x402Client()
  .register("algorand:*", new ExactAvmClient(signer));
```

## Supported Networks

Networks are identified via CAIP-2:
- `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` - Mainnet
- `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` - Testnet
- `algorand:*` - Wildcard (matches all Algorand networks)

## Signer Implementation

Use the built-in helper functions to create signers from a Base64-encoded private key. These use `generateAddressWithSigners` from `@algorandfoundation/algokit-utils` internally for canonical Ed25519 signing.

### Client Signer

```typescript
import { toClientAvmSigner } from "@x402/avm";

const signer = toClientAvmSigner(process.env.AVM_PRIVATE_KEY!);
// signer.address — the Algorand address
// signer.signTransactions(txns, indexesToSign) — signs transactions
```

### Facilitator Signer

```typescript
import { toFacilitatorAvmSigner } from "@x402/avm";

// Default (uses AlgorandClient.testNet() / .mainNet() from algokit-utils):
const signer = toFacilitatorAvmSigner(process.env.AVM_PRIVATE_KEY!);

// With custom Algod URLs:
const signer = toFacilitatorAvmSigner(process.env.AVM_PRIVATE_KEY!, {
  testnetUrl: "https://my-testnet-node.example.com",
  mainnetUrl: "https://my-mainnet-node.example.com",
});
```

See [facilitator example](../../examples/typescript/facilitator/) for a full implementation.

## Environment Variables

### Client Applications

Applications that make payments using an Algorand wallet.

| Variable | Required | Description |
|----------|----------|-------------|
| `AVM_PRIVATE_KEY` | Yes | Base64-encoded 64-byte Algorand private key (32-byte seed + 32-byte public key). Used to sign payment transactions. |

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

### Key Format

The `AVM_PRIVATE_KEY` is a Base64-encoded string containing a 64-byte Algorand private key:
- First 32 bytes: Ed25519 seed (signing key)
- Last 32 bytes: Ed25519 public key

To derive the Algorand address from the private key:

```typescript
import { toClientAvmSigner } from "@x402/avm";
const signer = toClientAvmSigner(process.env.AVM_PRIVATE_KEY!);
console.log(signer.address); // Algorand address
```

### Network Connectivity

The SDK uses `AlgorandClient` from `@algorandfoundation/algokit-utils` for all network connectivity. By default it connects to [AlgoNode](https://algonode.io/) public endpoints (free, no authentication required). Custom endpoints can be configured via `FacilitatorAvmSignerConfig` or by passing an `AlgorandClient` instance via `ClientAvmConfig.algorandClient`.

## Asset Support

Supports Algorand Standard Assets (ASA):
- USDC (primary)
- Any ASA with proper opt-in

### Testnet Faucets

- **ALGO**: https://lora.algokit.io/testnet/fund
- **USDC on Algorand**: https://faucet.circle.com/

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
