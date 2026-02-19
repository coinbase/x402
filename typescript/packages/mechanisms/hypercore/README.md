# @x402/hypercore

Hypercore L1 (Hyperliquid) implementation of the x402 payment protocol using the **Exact** payment scheme with EIP-712 signed SendAsset actions and API-based settlement.

## Installation

```bash
npm install @x402/hypercore
```

## Overview

This package provides three main components for handling x402 payments on Hypercore L1 (Hyperliquid):

- **Client** - For applications that need to make payments (have wallets/signers)
- **Facilitator** - For payment processors that verify and settle payments via Hyperliquid API
- **Server** - For resource servers that accept payments and build payment requirements

## Package Exports

### Main Package (`@x402/hypercore`)

**V2 Protocol Support** - Modern x402 protocol with CAIP-2 network identifiers

**Client:**
- `ExactHypercoreScheme` - V2 client implementation using EIP-712 signed SendAsset
- `ClientHypercoreSigner` - TypeScript type for client signers
- `toClientHypercoreSigner(signer)` - Identity function for type safety

**Facilitator:**
- `ExactHypercoreScheme` - V2 facilitator for payment verification and API settlement
- `FacilitatorHypercoreSigner` - TypeScript type for facilitator configuration
- `toFacilitatorHypercoreSigner(apiUrl)` - Creates facilitator configuration

**Server:**
- `ExactHypercoreScheme` - V2 server for building payment requirements

**Types:**
- `HypercoreSendAssetAction` - SendAsset action structure
- `HypercorePaymentPayload` - Payment payload structure
- `HyperliquidApiResponse` - API response structure

### Client Registration (`@x402/hypercore/exact/client`)

**Exports:**
- `registerExactHypercoreScheme(client, config)` - Registers Hypercore schemes
- `HypercoreClientConfig` - Configuration interface

**Example:**
```typescript
import { registerExactHypercoreScheme } from "@x402/hypercore/exact/client";
import { x402Client } from "@x402/core/client";
import { privateKeyToAccount, signTypedData } from "viem/accounts";

const account = privateKeyToAccount("0x...");
const signer = {
  async signSendAsset(action) {
    const signature = await signTypedData({
      privateKey: account.privateKey,
      domain: {
        name: "HyperliquidSignTransaction",
        version: "1",
        chainId: 999n,
        verifyingContract: "0x0000000000000000000000000000000000000000",
      },
      message: action,
      primaryType: "HyperliquidTransaction:SendAsset",
      types: {
        "HyperliquidTransaction:SendAsset": [
          { name: "hyperliquidChain", type: "string" },
          { name: "destination", type: "string" },
          { name: "sourceDex", type: "string" },
          { name: "destinationDex", type: "string" },
          { name: "token", type: "string" },
          { name: "amount", type: "string" },
          { name: "fromSubAccount", type: "string" },
          { name: "nonce", type: "uint64" },
        ],
      },
    });
    return {
      r: signature.slice(0, 66),
      s: "0x" + signature.slice(66, 130),
      v: parseInt(signature.slice(130, 132), 16),
    };
  },
  getAddress: () => account.address,
};

const client = new x402Client();
registerExactHypercoreScheme(client, { signer });
```

### Server Registration (`@x402/hypercore/exact/server`)

**Exports:**
- `registerExactHypercoreScheme(server, config?)` - Registers server schemes
- `HypercoreServerConfig` - Configuration interface

### Facilitator Registration (`@x402/hypercore/exact/facilitator`)

**Exports:**
- `registerExactHypercoreScheme(facilitator, config?)` - Registers facilitator schemes
- `HypercoreFacilitatorConfig` - Configuration interface

## Usage Patterns

### 1. Direct Registration (Recommended)

```typescript
import { x402Client } from "@x402/core/client";
import { registerExactHypercoreScheme } from "@x402/hypercore/exact/client";

const client = new x402Client();
registerExactHypercoreScheme(client, { signer: myHypercoreSigner });
```

### 2. Using Config (Flexible)

```typescript
import { x402Client } from "@x402/core/client";
import { ExactHypercoreScheme } from "@x402/hypercore/exact/client";

const client = x402Client.fromConfig({
  schemes: [
    { network: "hypercore:mainnet", client: new ExactHypercoreScheme(signer) },
    { network: "hypercore:testnet", client: new ExactHypercoreScheme(signer) }
  ],
  policies: [myCustomPolicy]
});
```

### 3. Facilitator Setup

```typescript
import { x402Facilitator } from "@x402/core/facilitator";
import { registerExactHypercoreScheme } from "@x402/hypercore/exact/facilitator";

const facilitator = new x402Facilitator();
registerExactHypercoreScheme(facilitator, {
  apiUrl: "https://api.hyperliquid.xyz" // Mainnet
});

// Or per-network configuration
registerExactHypercoreScheme(facilitator, {
  apiUrls: {
    "hypercore:mainnet": "https://api.hyperliquid.xyz",
    "hypercore:testnet": "https://api.hyperliquid-testnet.xyz"
  }
});
```

### 4. Server Setup

```typescript
import { x402ResourceServer } from "@x402/core/server";
import { registerExactHypercoreScheme } from "@x402/hypercore/exact/server";

const server = new x402ResourceServer(facilitator);
registerExactHypercoreScheme(server);
```

## Supported Networks

**V2 Networks** (via CAIP-2):
- `hypercore:mainnet` - Hyperliquid production network
- `hypercore:testnet` - Hyperliquid testing network

## Asset Support

Supports USDH (Hyperliquid USD) token by default:
- **Default Token**: `USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b`
- **Decimals**: 6
- **Settlement**: Via Hyperliquid API (no gas fees)

### Custom Asset Configuration

By default, all networks use USDH as the default asset. Facilitators can configure custom assets using money parsers:

```typescript
import { ExactHypercoreScheme } from "@x402/hypercore/exact/server";

const server = new ExactHypercoreScheme();

// Register custom money parser for specific amounts or conditions
server.registerMoneyParser((amount, network) => {
  if (amount > 1000) {
    // Use a different token for large amounts
    return {
      amount: (amount * 1e18).toString(),
      asset: "CUSTOM:0x...",
      extra: { name: "Custom Token", decimals: 18 }
    };
  }
  return null; // Use default USDH
});

// Multiple parsers can be registered - tried in order
server.registerMoneyParser((amount, network) => {
  if (network === "hypercore:testnet" && amount < 0.10) {
    return {
      amount: (amount * 1e6).toString(),
      asset: "TEST:0x...",
      extra: { name: "Test Token", decimals: 6 }
    };
  }
  return null;
});
```

**Parser Chain Behavior:**
1. Custom parsers are tried in registration order
2. First parser that returns non-null wins
3. If all return null, default USDH asset is used
4. This matches the EVM mechanism pattern exactly

## Transaction Structure

The exact payment scheme uses EIP-712 signed SendAsset actions with:
- **Signing Domain**: `HyperliquidSignTransaction` (chainId: 999)
- **Nonces**: Timestamp-based (milliseconds since epoch)
- **Max Age**: 1 hour (nonces older than 1 hour are rejected)
- **Settlement**: API-based submission (no on-chain transaction required)
- **Confirmation**: Transaction hash retrieved via ledger query

### Key Differences from EVM/SVM

| Feature | EVM/SVM | Hypercore L1 |
|---------|---------|--------------|
| **Settlement** | On-chain transaction | API submission |
| **Facilitator** | Needs wallet + gas | Stateless (no wallet) |
| **Nonce** | Sequential/blockhash | Timestamp-based |
| **Signature** | EIP-3009 / SPL | EIP-712 SendAsset |
| **Confirmation** | Block inclusion | Ledger query |
| **Gas Fees** | Yes | No |

## EIP-712 SendAsset Action

```typescript
{
  type: "sendAsset",
  hyperliquidChain: "Mainnet" | "Testnet",
  signatureChainId: "0x3e7", // 999 in hex
  destination: "0x...", // Recipient address
  sourceDex: "spot",
  destinationDex: "spot",
  token: "USDH:0x54e00a5988577cb0b0c9ab0cb6ef7f4b",
  amount: "0.010000", // USD string with 6 decimals
  fromSubAccount: "", // Empty for main account
  nonce: 1738697234567 // Timestamp in milliseconds
}
```

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
- `@x402/evm` - EVM/Ethereum implementation
- `@x402/svm` - Solana/SVM implementation
