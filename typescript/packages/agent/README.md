# @x402/agent

Simplified x402 client for AI agents with zero-config setup. Addresses the feedback from [issue #1759](https://github.com/coinbase/x402/issues/1759) about x402 onboarding complexity.

## The Problem

x402 has better protocol design than MPP/Tempo, but worse developer experience. Users are choosing inferior protocols because they have a better first-5-minutes experience.

**Before (@x402/agent):**

```typescript
// Complex setup - multiple packages, manual wallet creation, scheme registration
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { ExactSvmScheme } from '@x402/svm/exact/client'
import { privateKeyToAccount } from 'viem/accounts'
import { createKeyPairSignerFromBytes } from '@solana/kit'

const evmSigner = privateKeyToAccount(process.env.EVM_PRIVATE_KEY)
const svmSigner = await createKeyPairSignerFromBytes(/*...*/)

const client = new x402Client()
client.register('eip155:*', new ExactEvmScheme(evmSigner))
client.register('solana:*', new ExactSvmScheme(svmSigner))

const fetchWithPayment = wrapFetchWithPayment(fetch, client)
```

**After (@x402/agent):**

```typescript
// Simple setup - one import, one function call
import { createX402Client } from '@x402/agent'

const client = createX402Client()
```

## Quick Start

### 1. Install

```bash
npm install @x402/agent
```

### 2. Use like fetch

```typescript
import { createX402Client } from '@x402/agent'

const client = createX402Client({
  maxPaymentPerCall: '0.10', // Max $0.10 USDC per call
  maxPaymentPerDay: '5.0', // Max $5.00 USDC per day
})

// Use it like normal fetch - payments happen automatically
const response = await client('https://api.example.com/paid-endpoint')
const data = await response.json()
```

That's it! No protocol knowledge needed. No manual wallet setup. Just `client()` instead of `fetch()`.

## What It Does

- **Auto-creates wallets**: First run generates EVM + Solana wallets at `~/.x402/wallet.json`
- **Multi-chain support**: Works with Base, Ethereum, Solana out of the box
- **Safety limits**: Built-in spending caps prevent runaway payments
- **Zero config**: Works immediately without reading docs

## Configuration

```typescript
const client = createX402Client({
  maxPaymentPerCall: '0.05', // Max per request (default: 0.05)
  maxPaymentPerHour: '1.0', // Max per hour (default: 1.0)
  maxPaymentPerDay: '10.0', // Max per day (default: 10.0)
  evmPrivateKey: '0x...', // Custom EVM key (optional)
  svmPrivateKey: 'base58', // Custom Solana key (optional)
  walletPath: '/custom/path', // Custom wallet location (optional)
})
```

## Wallet Setup

On first run, you'll see:

```
🆕 Created new x402 wallet at /Users/you/.x402/wallet.json
💰 EVM Address: 0x742d35Cc6e6B1C3f4c7b8c5e8f1a2b3c4d5e6f7g (Base, Ethereum)
💰 SVM Address: 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM (Solana)
⚠️  Fund these addresses with USDC to start making payments
```

Fund these addresses with USDC and you're ready to go!

## Utilities

```typescript
import { getWalletInfo } from '@x402/agent'

// Check wallet status
const wallet = getWalletInfo()
if (wallet) {
  console.log('EVM Address:', wallet.addresses.evm)
  console.log('Solana Address:', wallet.addresses.svm)
} else {
  console.log('No wallet found')
}
```

## Examples

### Basic Usage

```typescript
import { createX402Client } from '@x402/agent'

const client = createX402Client()

// Call any x402-enabled API
const weather = await client('https://api.example.com/weather?city=Tokyo')
const data = await weather.json()
```

### With Safety Limits

```typescript
const client = createX402Client({
  maxPaymentPerCall: '0.01', // Penny per call
  maxPaymentPerDay: '1.0', // Dollar per day
})

// Throws error if limits would be exceeded
try {
  const response = await client('https://expensive-api.com/data')
} catch (error) {
  console.log('Spending limit reached:', error.message)
}
```

### Custom Wallet

```typescript
const client = createX402Client({
  evmPrivateKey: '0x...', // Your own Base/Ethereum key
  svmPrivateKey: 'base58...', // Your own Solana key
})
```

## Comparison with Alternatives

| Feature          | @x402/agent     | @x402/fetch        | Tempo            | MPP               |
| ---------------- | --------------- | ------------------ | ---------------- | ----------------- |
| Setup complexity | ⭐ One function | ⭐⭐ Manual config | ⭐ Hosted wallet | ⭐⭐ Complex      |
| Multi-chain      | ✅ EVM + Solana | ✅ EVM + Solana    | ✅ Multi-chain   | ❌ Lightning only |
| Self-custody     | ✅ Local wallet | ✅ User keys       | ❌ Custodial     | ✅ User keys      |
| Safety limits    | ✅ Built-in     | ❌ Manual          | ⭐⭐ Dashboard   | ❌ Manual         |
| Protocol quality | ✅ x402 v2      | ✅ x402 v2         | ❌ Proprietary   | ❌ Complex        |

## Feedback Welcome

This addresses feedback from APIbase.pro users in [issue #1759](https://github.com/coinbase/x402/issues/1759). Tell us what else would improve the developer experience!

## Contributing

This package is built on top of the existing x402 ecosystem:

- `@x402/fetch` - Core fetch wrapper
- `@x402/evm` - Ethereum/Base payment schemes
- `@x402/svm` - Solana payment schemes
- `@x402/core` - Protocol implementation

It simply provides a simplified interface with sensible defaults.
