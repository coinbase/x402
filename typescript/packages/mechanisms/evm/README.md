# @x402/evm

EVM (Ethereum Virtual Machine) implementation of the x402 payment protocol using the **Exact** payment scheme with EIP-3009 TransferWithAuthorization.

## Installation

```bash
npm install @x402/evm
```

## Overview

This package provides three main components for handling x402 payments on EVM-compatible blockchains:

- **Client** - For applications that need to make payments (have wallets/signers)
- **Facilitator** - For payment processors that verify and execute on-chain transactions  
- **Service** - For resource servers that accept payments and build payment requirements

## Package Exports

### Main Package (`@x402/evm`)

**V2 Protocol Support** - Modern x402 protocol with CAIP-2 network identifiers

**Client:**
- `ExactEvmClient` - V2 client implementation using EIP-3009
- `toClientEvmSigner(account)` - Converts viem accounts to x402 signers
- `ClientEvmSigner` - TypeScript type for client signers

**Facilitator:**
- `ExactEvmFacilitator` - V2 facilitator for payment verification and settlement
- `toFacilitatorEvmSigner(wallet)` - Converts viem wallets to facilitator signers
- `FacilitatorEvmSigner` - TypeScript type for facilitator signers

**Service:**
- `ExactEvmServer` - V2 service for building payment requirements

### V1 Package (`@x402/evm/v1`)

**V1 Protocol Support** - Legacy x402 protocol with simple network names

**Exports:**
- `ExactEvmClientV1` - V1 client implementation
- `ExactEvmFacilitatorV1` - V1 facilitator implementation  
- `NETWORKS` - Array of all supported V1 network names

**Supported V1 Networks:**
```typescript
[
  "abstract", "abstract-testnet",
  "base-sepolia", "base",
  "avalanche-fuji", "avalanche",
  "iotex", "sei", "sei-testnet",
  "polygon", "polygon-amoy",
  "peaq", "story", "educhain",
  "skale-base-sepolia"
]
```

### Client Builder (`@x402/evm/client`)

**Convenience builder** for creating fully-configured EVM clients

**Exports:**
- `createEvmClient(config)` - Creates x402Client with EVM support
- `EvmClientConfig` - Configuration interface

**What it does:**
- Automatically registers V2 wildcard scheme (`eip155:*`)
- Automatically registers all V1 networks from `NETWORKS`
- Optionally applies payment policies
- Optionally uses custom payment selector

**Example:**
```typescript
import { createEvmClient } from "@x402/evm/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const signer = toClientEvmSigner(account);

const client = createEvmClient({ signer });
// Ready to use with both V1 and V2!
```

## Version Differences

### V2 (Main Package)
- Network format: CAIP-2 (`eip155:8453`)
- Wildcard support: Yes (`eip155:*`)
- Payload structure: Partial (core wraps with metadata)
- Extensions: Full support
- Validity window: 1 hour (default)

### V1 (V1 Package)  
- Network format: Simple names (`base-sepolia`)
- Wildcard support: No (fixed list)
- Payload structure: Complete
- Extensions: Limited
- Validity window: 10 minutes with buffer

## Usage Patterns

### 1. Using Pre-built Builder (Recommended)

```typescript
import { createEvmClient } from "@x402/evm/client";
import { wrapFetchWithPayment } from "@x402/fetch";

const client = createEvmClient({ signer: myEvmSigner });
const paidFetch = wrapFetchWithPayment(fetch, client);
```

### 2. Direct Registration (Full Control)

```typescript
import { x402Client } from "@x402/core/client";
import { ExactEvmClient } from "@x402/evm";
import { ExactEvmClientV1 } from "@x402/evm/v1";

const client = new x402Client()
  .register("eip155:*", new ExactEvmClient(signer))
  .registerSchemeV1("base-sepolia", new ExactEvmClientV1(signer))
  .registerSchemeV1("base", new ExactEvmClientV1(signer));
```

### 3. Using Config (Flexible)

```typescript
import { x402Client } from "@x402/core/client";
import { ExactEvmClient } from "@x402/evm";

const client = x402Client.fromConfig({
  schemes: [
    { network: "eip155:*", client: new ExactEvmClient(signer) },
    { network: "base-sepolia", client: new ExactEvmClientV1(signer), x402Version: 1 }
  ],
  policies: [myCustomPolicy]
});
```

## Supported Networks

**V2 Networks** (via CAIP-2):
- `eip155:1` - Ethereum Mainnet
- `eip155:8453` - Base Mainnet  
- `eip155:84532` - Base Sepolia
- `eip155:*` - Wildcard (matches all EVM chains)
- Any `eip155:<chainId>` network

**V1 Networks** (simple names):
See `NETWORKS` constant in `@x402/evm/v1`

## Asset Support

Supports any ERC-3009 compatible token:
- USDC (primary)
- EURC
- Any token implementing `transferWithAuthorization()`

## Development

```bash
# Build
npm run build

# Test
npm run test

# Integration tests
npm run test:integration

# Lint & Format
npm run lint
npm run format
```

## Related Packages

- `@x402/core` - Core protocol types and client
- `@x402/fetch` - HTTP wrapper with automatic payment handling
- `@x402/svm` - Solana/SVM implementation
