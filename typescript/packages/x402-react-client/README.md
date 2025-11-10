# x402-react-client

React SDK for the x402 payment protocol. Enable instant, gas-free micropayments in your React/Next.js apps.

## Installation

```bash
npm install x402-react-client wagmi viem @tanstack/react-query
# Optional: For default UI
npm install @rainbow-me/rainbowkit
```

## Quick Start

### 1. Wrap your app with `X402Provider`

```tsx
// app/layout.tsx
import { X402Provider } from 'x402-react-client';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <X402Provider
          config={{
            appName: 'My App',
            walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID,
          }}
        >
          {children}
        </X402Provider>
      </body>
    </html>
  );
}
```

### 2. Use the hooks

```tsx
// app/page.tsx
'use client';
import { 
  useX402Payment, 
  useX402Balance,
  ConnectButton  // Import from x402-react-client, not @rainbow-me/rainbowkit
} from 'x402-react-client';

export default function Page() {
  const { pay, isPending, data, receipt, error } = useX402Payment({
    onSuccess: (data, receipt) => {
      console.log('Content unlocked!', data);
      console.log('Transaction:', receipt?.transaction);
    },
  });

  const { formatted } = useX402Balance();

  return (
    <div>
      <ConnectButton />
      <p>Balance: {formatted}</p>
      
      <button onClick={() => pay('/api/random')} disabled={isPending}>
        {isPending ? 'Paying...' : 'Get Random Number ($0.01)'}
      </button>
      
      {error && <p>{error.message}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      {receipt && <p>TX: {receipt.transaction}</p>}
    </div>
  );
}
```

## Important: Import Everything from x402-react-client

To avoid context issues, **always import wallet-related utilities from `x402-react-client`** instead of importing them directly from wagmi or RainbowKit.

```tsx
// Right way - Everything shares the same context
import { 
  X402Provider, 
  useX402Payment,
  ConnectButton,
  useAccount,
  useDisconnect 
} from 'x402-react-client';

// Wrong - Creates separate contexts that can't talk to each other
import { X402Provider, useX402Payment } from 'x402-react-client';
import { ConnectButton } from '@rainbow-me/rainbowkit';  // Different context!
import { useAccount } from 'wagmi';  // Different context!
```

### Why does this matter?

React contexts are isolated trees. When you import `ConnectButton` directly from RainbowKit or hooks from wagmi, they look for their provider context. But `X402Provider` already wraps these providers internally. Importing from multiple sources creates separate, disconnected context trees that can't communicate.

Think of it like having one app trying to share two different context state. By importing everything from `x402-react-client`, you ensure all components and hooks are using the same unified context.

## API Reference

### `<X402Provider>`

Configures wallet connections and blockchain providers.

**Props:**
- `config.appName` - App name shown in wallet modals
- `config.walletConnectProjectId` - [Get yours here](https://cloud.walletconnect.com)
- `config.mode` - `'rainbowkit'` (default) or `'headless'`
- `config.chains` - Custom chains (defaults to Base, Polygon, Avalanche + testnets)
- `config.connectors` - Custom wagmi connectors for advanced use cases
- `config.customWagmiConfig` - Full wagmi config override for maximum control

### `useX402Payment(options?)`

Handles x402 protocol payments with support for various response types.

**Options:**
- `onSuccess?: (data, receipt?) => void` - Called when payment succeeds. Receives both the response data and optional payment receipt with transaction details.
- `onError?: (error) => void` - Called when payment fails
- `responseType?: 'json' | 'text' | 'blob' | 'stream' | 'response'` - Expected response type (default: 'json')

**Returns:**
- `pay(endpoint, fetchOptions?)` - Initiate payment
- `isPending` - Whether payment is in progress
- `data` - API response data
- `receipt` - Payment receipt with transaction details (if available)
- `error` - Error object if payment failed
- `status` - Payment status: `'idle' | 'pending' | 'success' | 'error'`

**Payment Receipt:**
```typescript
{
  success: boolean;
  transaction?: string;  // Transaction hash
  network?: string;      // Blockchain network
  payer?: string;        // User's address
}
```

### `useX402Balance(options?)`

Tracks user's USDC (default) balance with real-time updates.

**Options:**
- `token?: Address` - Custom token address (defaults to USDC)
- `pollingInterval?: number` - Polling interval in ms (default: 10000)
- `onSuccess?: (balance) => void` - Called when balance changes (only if callbackOnPoll is true) or when refresh() is called
- `onError?: (error) => void` - Called on fetch error
- `callbackOnPoll?: boolean` - Whether to trigger onSuccess callback on balance changes (default: false). When false, onSuccess only fires when you call refresh().

**Returns:**
- `balance` - Raw balance as string
- `formatted` - USD formatted balance (e.g., "$1,234.56")
- `isLoading` - Whether balance is being fetched
- `error` - Error object if fetch failed
- `refresh()` - Manually refresh balance and trigger onSuccess callback

**Callback Behavior:**
By default, `onSuccess` is **only called when you manually call `refresh()`**. This prevents unnecessary re-renders when you just want to display the balance. Set `callbackOnPoll: true` if you need to react to every balance change automatically.

```tsx
// Default: onSuccess only on manual refresh
const { balance, refresh } = useX402Balance({
  onSuccess: (bal) => console.log('Refreshed:', bal)
});
// onSuccess fires when you call refresh()

// Auto-callback: onSuccess on every balance change
const { balance } = useX402Balance({
  callbackOnPoll: true,
  onSuccess: (bal) => console.log('Balance changed:', bal)
});
// onSuccess fires automatically when balance updates
```

### Re-exported Utilities

For convenience, commonly used hooks and components are re-exported:

```tsx
import { 
  // Wagmi hooks
  useAccount,
  useConnect, 
  useDisconnect,
  useBalance,
  
  // RainbowKit UI
  ConnectButton
} from 'x402-react-client';
```

These work seamlessly with `X402Provider` since they're all part of the same context tree.

## Response Types

### JSON (Default)
```tsx
const { pay, data } = useX402Payment();

await pay('/api/data'); // Returns parsed JSON
console.log(data.message);
```

### Streaming Responses
```tsx
const { pay } = useX402Payment({
  responseType: 'stream',
  onSuccess: async (stream) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      console.log('Received:', chunk);
    }
  }
});

await pay('/api/stream'); // Returns ReadableStream
```

### File Downloads
```tsx
const { pay } = useX402Payment({
  responseType: 'blob',
  onSuccess: (blob, receipt) => {
    // Download file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'protected-file.pdf';
    a.click();
    URL.revokeObjectURL(url);
    
    // Save receipt
    console.log('Download TX:', receipt?.transaction);
  }
});

await pay('/api/download');
```

### Plain Text
```tsx
const { pay } = useX402Payment({ responseType: 'text' });
const text = await pay('/api/text');
```

### Full Response Control
```tsx
const { pay } = useX402Payment({ responseType: 'response' });
const response = await pay('/api/custom');

// Access headers, status, etc.
console.log(response.headers.get('Content-Type'));
const data = await response.json();
```

## Payment Receipts

Save transaction receipts for accounting, analytics, or user history:

```tsx
const { pay } = useX402Payment({
  onSuccess: async (data, receipt) => {
    if (receipt?.transaction) {
      // Save to database
      await fetch('/api/receipts', {
        method: 'POST',
        body: JSON.stringify({
          txHash: receipt.transaction,
          network: receipt.network,
          payer: receipt.payer,
          content: data,
          timestamp: Date.now(),
        }),
      });
      
      // Show blockchain explorer link
      const explorerUrl = `https://basescan.org/tx/${receipt.transaction}`;
      toast.success(`Payment confirmed! View: ${explorerUrl}`);
    }
  }
});
```

## Advanced Usage

### Headless Mode (Custom UI)

```tsx
import { 
  X402Provider,
  useConnect,
  useAccount,
  useDisconnect 
} from 'x402-react-client';

// In layout.tsx
<X402Provider config={{ mode: 'headless' }}>
  {children}
</X402Provider>

// In your component
function CustomWalletButton() {
  const { connectors, connect } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div>
        <p>{address}</p>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      {connectors.map((connector) => (
        <button key={connector.id} onClick={() => connect({ connector })}>
          Connect {connector.name}
        </button>
      ))}
    </div>
  );
}
```

### POST Requests with Body

```tsx
const { pay } = useX402Payment();

await pay('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    prompt: 'A cat riding a skateboard',
    style: 'photorealistic'
  })
});
```

### Custom Connectors

```tsx
import { injected, metaMask, coinbaseWallet } from 'wagmi/connectors';

<X402Provider
  config={{
    mode: 'headless',
    connectors: [
      injected({
        target: {
          id: 'binanceWallet',
          name: 'Binance',
          provider: (window) => window.BinanceChain,
        },
      }),
      injected({
        target: {
          id: 'okxWallet',
          name: 'OKX',
          provider: (window) => window.okxwallet,
        },
      }),
      metaMask(),
      coinbaseWallet({ appName: 'My App' }),
    ],
  }}
>
  {children}
</X402Provider>
```

Note: When using custom connectors, you still need to import the connector functions from `wagmi/connectors` directly since those are configuration functions, not React components or hooks.

### Error Handling

```tsx
const { pay, error } = useX402Payment({
  onError: (error) => {
    if (error.message.includes('User rejected')) {
      toast.error('Payment cancelled by user');
    } else if (error.message.includes('Wallet not connected')) {
      toast.error('Please connect your wallet first');
    } else if (error.message.includes('Unsupported network')) {
      toast.error('This payment requires a different blockchain');
    } else {
      toast.error('Payment failed. Please try again.');
    }
  }
});
```

## How It Works

1. User clicks "Pay" button → `pay('/api/protected')`
2. SDK detects `402 Payment Required` response
3. Automatically switches to correct blockchain network
4. Prompts user to **sign a message** (NO gas fees!)
5. Retries request with payment proof in `X-PAYMENT` header
6. Your protected endpoint returns content immediately
7. Middleware adds payment receipt in `X-PAYMENT-RESPONSE` header
8. SDK extracts receipt and calls `onSuccess(data, receipt)`