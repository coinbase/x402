# Building Miniapps with x402

This guide explains how to build Farcaster Mini Apps that integrate x402 payments using our official example. The example provides a complete starting point with wallet integration, payment protection, and responsive design.

## What are Mini Apps?

Mini Apps are lightweight applications that run inside Farcaster clients. Built with [MiniKit](https://docs.base.org/builderkits/minikit/overview) and [OnchainKit](https://onchainkit.xyz), they provide a native app-like experience while leveraging the social graph and wallet capabilities of Farcaster. By integrating x402, your Mini App can accept instant USDC payments without requiring users to leave the app or manage complex payment flows.

## Why x402 for Mini Apps?

x402 is particularly well-suited for Mini Apps because:

- **Seamless Payments**: Users pay without leaving the Mini App experience
- **No Account Setup**: Works directly with connected wallets
- **Instant Monetization**: Builders can monetize their content or services directly
- **Simple Integration**: Payment protection with just the `withX402` wrapper
- **No CDP API Keys Required**: Uses external facilitator directly

## Prerequisites

Before starting, ensure you have:

- Node.js 22+ and pnpm v10 installed
- USDC on Base Sepolia testnet (for testing)
- A wallet address to receive payments
- An [OnchainKit API key](https://onchainkit.xyz) (optional, for enhanced wallet features)

## Quick Start with the Official Example

The fastest way to build an x402-powered Mini App is using our official example:

```bash
# Clone the x402 repository
git clone https://github.com/coinbase/x402.git
cd x402/examples/typescript

# Install dependencies and build packages
pnpm install && pnpm build

# Navigate to the miniapp example
cd fullstack/miniapp

# Copy environment variables
cp .env-local .env

# Configure your environment (see below)
# Then start the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Tech Stack

The Mini App example uses:

- **Frontend**: Next.js, React, Tailwind CSS
- **Wallet**: OnchainKit, Wagmi
- **Payments**: x402 v2 SDK (`@x402/next`, `@x402/fetch`, `@x402/evm`)
- **Farcaster**: Mini App SDK for Mini App detection

## Environment Configuration

Create a `.env` file with the following variables:

```env
# x402 Payment Configuration (required)
FACILITATOR_URL=https://x402.org/facilitator
EVM_ADDRESS=0xYourWalletAddress

# OnchainKit Configuration
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key_here
NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME=x402 Mini App

# App URLs and Images
NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_APP_HERO_IMAGE=https://example.com/app-logo.png
NEXT_PUBLIC_SPLASH_IMAGE=https://example.com/app-logo-200x200.png
NEXT_PUBLIC_SPLASH_BACKGROUND_COLOR=#3b82f6
NEXT_PUBLIC_ICON_URL=https://example.com/app-logo.png
```

### Getting Configuration Values

1. **EVM_ADDRESS**: Your wallet address to receive payments
2. **FACILITATOR_URL**: Use `https://x402.org/facilitator` for testnet, or the CDP facilitator for mainnet
3. **OnchainKit API Key**: Get from [OnchainKit](https://onchainkit.xyz) (optional but recommended)

## How It Works

### Server-Side: Protected API Routes

The Mini App uses the `withX402` wrapper to protect API routes. This wrapper:

1. Returns a 402 Payment Required response with payment requirements
2. Validates the payment signature when provided
3. Only settles payment after a successful response (status < 400)

```typescript
// app/api/protected/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL,
});

// Create x402 resource server and register EVM scheme
const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

// Handler function - only called after payment is verified
const handler = async (_: NextRequest) => {
  return NextResponse.json({
    success: true,
    message: "Protected action completed successfully",
    timestamp: new Date().toISOString(),
    data: {
      secretMessage: "This content was paid for with x402!",
      accessedAt: Date.now(),
    },
  });
};

// Export wrapped handler with payment requirements
export const GET = withX402(
  handler,
  {
    accepts: [
      {
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532", // Base Sepolia
        payTo: process.env.EVM_ADDRESS as `0x${string}`,
      },
    ],
    description: "Access to protected Mini App API",
    mimeType: "application/json",
  },
  server,
);
```

### Client-Side: Payment Handling

The frontend uses `@x402/fetch` with the connected wallet to handle payments automatically:

```typescript
// app/page.tsx
"use client";

import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import type { WalletClient, Account } from "viem";
import { useWalletClient } from "wagmi";

/**
 * Converts a wagmi/viem WalletClient to a ClientEvmSigner for x402Client
 */
function wagmiToClientSigner(walletClient: WalletClient): ClientEvmSigner {
  if (!walletClient.account) {
    throw new Error("Wallet client must have an account");
  }

  return {
    address: walletClient.account.address,
    signTypedData: async (message) => {
      const signature = await walletClient.signTypedData({
        account: walletClient.account as Account,
        domain: message.domain,
        types: message.types,
        primaryType: message.primaryType,
        message: message.message,
      });
      return signature;
    },
  };
}

export default function App() {
  const { data: walletClient } = useWalletClient();

  const handleProtectedAction = async () => {
    if (!walletClient) {
      console.error("Wallet not connected");
      return;
    }

    // Create x402 client and register EVM scheme with wagmi signer
    const client = new x402Client();
    const signer = wagmiToClientSigner(walletClient);
    registerExactEvmScheme(client, { signer });

    // Wrap fetch with payment handling
    const fetchWithPayment = wrapFetchWithPayment(fetch, client);

    // Make request - payment is handled automatically
    const response = await fetchWithPayment("/api/protected", {
      method: "GET",
    });

    const data = await response.json();
    console.log("Response:", data);
  };

  return (
    <button onClick={handleProtectedAction}>
      Call Protected API ($0.01)
    </button>
  );
}
```

### Wallet Integration with OnchainKit

The example uses OnchainKit for wallet connection. The provider setup enables MiniKit for Farcaster integration:

```typescript
// app/providers.tsx
"use client";

import { baseSepolia } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={baseSepolia}
      config={{
        appearance: {
          mode: "auto", // 'light' | 'dark' | 'auto'
        },
        wallet: {
          display: "modal", // 'modal' | 'drawer'
          preference: "all", // 'all' | 'smartWalletOnly' | 'eoaOnly'
        },
      }}
      miniKit={{
        enabled: true,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
```

### Farcaster Mini App Detection

The app detects when it's running inside Farcaster using the Mini App SDK:

```typescript
import { sdk } from "@farcaster/miniapp-sdk";

useEffect(() => {
  const initMiniApp = async () => {
    await sdk.actions.ready();
    const isInMiniApp = await sdk.isInMiniApp();
    console.log("Running in Mini App:", isInMiniApp);
  };
  initMiniApp();
}, []);
```

## Adding More Protected Routes

Create additional protected endpoints by adding new route files:

```typescript
// app/api/premium/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL,
});

const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);

const handler = async (_: NextRequest) => {
  return NextResponse.json({ message: "Premium content!" });
};

export const GET = withX402(
  handler,
  {
    accepts: [
      {
        scheme: "exact",
        price: "$0.10", // Higher price for premium content
        network: "eip155:84532",
        payTo: process.env.EVM_ADDRESS as `0x${string}`,
      },
    ],
    description: "Premium content access",
    mimeType: "application/json",
  },
  server,
);
```

## Response Format

### Payment Required (402)

When a request is made without payment:

```
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: <base64-encoded JSON>
```

The `PAYMENT-REQUIRED` header contains:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x...",
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USDC", "version": "2" }
    }
  ]
}
```

### Successful Response

After payment:

```json
{
  "success": true,
  "message": "Protected action completed successfully",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "secretMessage": "This content was paid for with x402!",
    "accessedAt": 1704067200000
  }
}
```

## Network Identifiers

Network identifiers use [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md) format:

| Network | CAIP-2 Identifier |
|---------|-------------------|
| Base Sepolia (testnet) | `eip155:84532` |
| Base (mainnet) | `eip155:8453` |

## Going to Production

To deploy your Mini App on mainnet:

1. **Update the facilitator URL** to use the CDP facilitator:
   ```env
   FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
   ```

2. **Update the network** in your route configuration:
   ```typescript
   network: "eip155:8453", // Base mainnet
   ```

3. **Use a mainnet wallet address** for `EVM_ADDRESS`

4. **Deploy to Vercel** or your preferred hosting platform

**Warning:** Mainnet transactions involve real money. Always test thoroughly on testnet first.

## Best Practices

### User Experience

- **Show prices clearly**: Display the payment amount before requiring payment
- **Loading states**: Show progress during payment processing
- **Error handling**: Provide clear error messages and recovery options
- **Success feedback**: Confirm successful payments immediately

### Security

- **Environment variables**: Never commit sensitive keys to version control
- **Server validation**: Always verify payments server-side with `withX402`
- **Network checking**: Ensure users are on the correct network

## Troubleshooting

### Payment Not Processing

```typescript
// Ensure wallet client is available before making requests
if (!walletClient) {
  console.error("Wallet client not available");
  return;
}
```

### Mini App Not Detected

```typescript
// SDK may not be available outside Farcaster
try {
  await sdk.actions.ready();
  const isInMiniApp = await sdk.isInMiniApp();
} catch (error) {
  console.log("Not running in Mini App context");
}
```

### Wrong Network

Ensure users are connected to Base Sepolia (testnet) or Base (mainnet) depending on your configuration.

## Resources

- [Full Mini App Example](https://github.com/coinbase/x402/tree/main/examples/typescript/fullstack/miniapp)
- [Farcaster Mini Apps Documentation](https://miniapps.farcaster.xyz/)
- [OnchainKit Documentation](https://onchainkit.xyz)
- [MiniKit Documentation](https://docs.base.org/builderkits/minikit/overview)
- [x402 Protocol Documentation](https://x402.org)
- [CDP Discord Community](https://discord.gg/cdp)
