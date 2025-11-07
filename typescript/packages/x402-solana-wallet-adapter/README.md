# @b3dotfun/anyspend-x402-solana-wallet-adapter

Solana wallet-adapter bridge for x402 payment protocol. Connects `@solana/wallet-adapter` (v1 format) with x402 library (v2 format).

## Why This Package?

The x402 library uses `@solana/kit` v2 (`TransactionSigner` interface), while browser wallet adapters use `@solana/web3.js` v1 (`VersionedTransaction` format). This package bridges the gap, allowing you to use popular Solana wallets (Phantom, Solflare, Ledger, etc.) with x402 payments.

## Installation

```bash
npm install @b3dotfun/anyspend-x402-solana-wallet-adapter
# or
pnpm add @b3dotfun/anyspend-x402-solana-wallet-adapter
# or
yarn add @b3dotfun/anyspend-x402-solana-wallet-adapter
```

**Peer Dependencies** (usually already installed in browser apps):

```bash
npm install @solana/wallet-adapter-base @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/web3.js react
```

## Features

- ✅ **Transaction Signer Bridge** - Converts between wallet-adapter v1 and x402 v2 formats
- ✅ **Type-Safe React Components** - Properly typed wallet adapter components with fixed React type compatibility
- ✅ **Full TypeScript Support** - Complete type definitions for all exports
- ✅ **All Wallets Supported** - Works with any `@solana/wallet-adapter` compatible wallet

## Usage

### Setting Up Wallet Provider

This package exports properly-typed React components that fix TypeScript compatibility issues with newer React versions:

```typescript
import {
  ConnectionProvider,
  WalletProvider,
  WalletModalProvider,
} from "@b3dotfun/anyspend-x402-solana-wallet-adapter";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";

function App() {
  const endpoint = useMemo(() => "https://api.mainnet-beta.solana.com", []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {/* Your app components */}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### Making Payments

```typescript
import {
  createWalletAdapterSigner,
  useWallet,
  WalletMultiButton,
} from "@b3dotfun/anyspend-x402-solana-wallet-adapter";
import { wrapFetchWithPayment } from "@b3dotfun/anyspend-x402-fetch";

function MyComponent() {
  const { publicKey, signAllTransactions, connected } = useWallet();

  const fetchData = async () => {
    if (!connected || !publicKey || !signAllTransactions) return;

    // Create a signer adapter for the connected wallet
    const signer = createWalletAdapterSigner(
      publicKey.toBase58(),
      signAllTransactions
    );

    // Wrap fetch with payment capability
    const fetchWithPayment = wrapFetchWithPayment(fetch, signer);

    // Make payment request
    const response = await fetchWithPayment("https://api.example.com/premium-data");
    const data = await response.json();
    return data;
  };

  return (
    <div>
      <WalletMultiButton />
      <button onClick={fetchData} disabled={!connected}>
        Get Premium Data
      </button>
    </div>
  );
}
```

### With Custom RPC and Callbacks

```typescript
import { createWalletAdapterSigner } from "@b3dotfun/anyspend-x402-solana-wallet-adapter";
import { wrapFetchWithPayment } from "@b3dotfun/anyspend-x402-fetch";

const signer = createWalletAdapterSigner(publicKey.toBase58(), signAllTransactions, count =>
  console.log(`Signing ${count} transaction(s)...`),
);

const fetchWithPayment = wrapFetchWithPayment(
  fetch,
  signer,
  undefined, // maxValue - let server determine
  undefined, // payment selector
  { svmConfig: { rpcUrl: "https://api.mainnet-beta.solana.com" } },
);
```

### Complete React Example

```typescript
import {
  createWalletAdapterSigner,
  useWallet,
  WalletMultiButton,
} from "@b3dotfun/anyspend-x402-solana-wallet-adapter";
import { wrapFetchWithPayment } from "@b3dotfun/anyspend-x402-fetch";
import { useState } from "react";

export function PremiumContent() {
  const { publicKey, signAllTransactions, connected } = useWallet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPremiumData = async () => {
    if (!connected || !publicKey || !signAllTransactions) {
      alert('Please connect your wallet');
      return;
    }

    setLoading(true);
    try {
      // Create signer adapter
      const signer = createWalletAdapterSigner(
        publicKey.toBase58(),
        signAllTransactions,
        (count) => console.log(`Please sign ${count} transaction(s)`)
      );

      // Wrap fetch with payment
      const fetchWithPayment = wrapFetchWithPayment(
        fetch,
        signer,
        undefined,
        undefined,
        { svmConfig: { rpcUrl: 'https://api.mainnet-beta.solana.com' } }
      );

      // Make payment request
      const response = await fetchWithPayment('https://api.example.com/premium');
      const result = await response.json();

      setData(result);
    } catch (error) {
      console.error('Payment failed:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <WalletMultiButton />

      <button
        onClick={fetchPremiumData}
        disabled={!connected || loading}
      >
        {loading ? 'Processing...' : 'Get Premium Data (Pay with USDC)'}
      </button>

      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
```

## API Reference

### Core Function

#### `createWalletAdapterSigner(walletAddress, signAllTransactions, onSign?)`

Creates a `TransactionSigner` compatible with x402 from a wallet adapter.

**Parameters:**

- `walletAddress` (string): The wallet's public key as base58 string (e.g., `publicKey.toBase58()`)
- `signAllTransactions` (function): The wallet adapter's `signAllTransactions` function
- `onSign` (optional function): Callback invoked when signing starts, receives transaction count

**Returns:**

- `TransactionSigner`: Signer instance for use with `wrapFetchWithPayment`

**Example:**

```typescript
const signer = createWalletAdapterSigner(publicKey.toBase58(), signAllTransactions, count =>
  setStatus(`Signing ${count} transaction(s)...`),
);
```

### React Components

This package re-exports properly-typed React components from `@solana/wallet-adapter-react` and `@solana/wallet-adapter-react-ui` with fixed TypeScript compatibility:

#### `ConnectionProvider`

Provides Solana RPC connection context to child components.

```typescript
import { ConnectionProvider } from "@b3dotfun/anyspend-x402-solana-wallet-adapter";

<ConnectionProvider endpoint="https://api.mainnet-beta.solana.com">
  {children}
</ConnectionProvider>;
```

#### `WalletProvider`

Provides wallet connection and management to child components.

```typescript
import { WalletProvider } from "@b3dotfun/anyspend-x402-solana-wallet-adapter";

<WalletProvider wallets={wallets} autoConnect={false}>
  {children}
</WalletProvider>;
```

#### `WalletModalProvider`

Provides modal UI for wallet selection.

```typescript
import { WalletModalProvider } from "@b3dotfun/anyspend-x402-solana-wallet-adapter";

<WalletModalProvider>{children}</WalletModalProvider>;
```

#### `WalletMultiButton`

Pre-built wallet connect/disconnect button component.

```typescript
import { WalletMultiButton } from "@b3dotfun/anyspend-x402-solana-wallet-adapter";

<WalletMultiButton className="my-wallet-button" />;
```

#### `useWallet()`

React hook to access wallet connection state and functions.

```typescript
import { useWallet } from "@b3dotfun/anyspend-x402-solana-wallet-adapter";

const { publicKey, connected, signAllTransactions } = useWallet();
```

## How It Works

### The v1 ↔ v2 Bridge

```
┌─────────────────────────────────────────────────────────┐
│ Browser Wallet (Phantom, Solflare, etc.)                │
│ Format: @solana/web3.js v1 VersionedTransaction         │
└─────────────────────────────────────────────────────────┘
                        ↓ signAllTransactions()
┌─────────────────────────────────────────────────────────┐
│ createWalletAdapterSigner (THIS PACKAGE)                │
│ Converts: v2 Transaction → v1 VersionedTransaction      │
│           Signed v1 → v2 signature format                │
└─────────────────────────────────────────────────────────┘
                        ↓ TransactionSigner interface
┌─────────────────────────────────────────────────────────┐
│ x402 Library (@b3dotfun/anyspend-x402)                  │
│ Format: @solana/kit v2 Transaction                      │
└─────────────────────────────────────────────────────────┘
```

### Transaction Flow

1. **x402 creates v2 transaction** with `messageBytes` and `signatures` object
2. **Adapter converts to v1** by serializing to `VersionedTransaction`
3. **Wallet signs v1 transaction** via `signAllTransactions()`
4. **Adapter extracts signatures** back to v2 format (address → Uint8Array)
5. **x402 broadcasts** the signed transaction

## Supported Wallets

This adapter works with any wallet that implements the `@solana/wallet-adapter` standard:

- ✅ Phantom
- ✅ Solflare
- ✅ Ledger
- ✅ Trezor
- ✅ Trust Wallet
- ✅ Coinbase Wallet
- ✅ And any other wallet-adapter compatible wallet

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  createWalletAdapterSigner,
  type TransactionSigner,
} from "@b3dotfun/anyspend-x402-solana-wallet-adapter";
```

## Related Packages

- [`@b3dotfun/anyspend-x402`](https://www.npmjs.com/package/@b3dotfun/anyspend-x402) - Core x402 library
- [`@b3dotfun/anyspend-x402-fetch`](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-fetch) - Fetch integration
- [`@b3dotfun/anyspend-x402-axios`](https://www.npmjs.com/package/@b3dotfun/anyspend-x402-axios) - Axios integration
- [`@solana/wallet-adapter-react`](https://www.npmjs.com/package/@solana/wallet-adapter-react) - React wallet adapter

## Examples

See the [fullstack example](https://github.com/b3-fun/anyspend-x402/tree/main/examples/typescript/fullstack/anyspend) for a complete implementation.

## License

Apache-2.0

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/b3-fun/anyspend-x402).
