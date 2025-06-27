# x402 Farcaster Mini App Example

This is a Next.js application that demonstrates how to build a [Farcaster Mini App](https://miniapps.farcaster.xyz/) with x402 payment-protected API endpoints. The app showcases seamless integration between Farcaster's social platform and x402's payment protocol.

## Features

- 🚀 **Farcaster Mini App**: Native-like app experience within Farcaster
- 💳 **x402 Payments**: Seamless payment processing on Base network
- 🔗 **Wallet Integration**: Connect with Coinbase Wallet via OnchainKit
- 🛡️ **Protected API Routes**: Server-side payment verification with x402 middleware
- 📱 **Responsive Design**: Optimized for mobile and desktop experiences

## Tech Stack

- **Frontend**: Next.js Canary (15), React 18, TypeScript
- **Styling**: Tailwind CSS
- **Wallet**: OnchainKit, Coinbase Wallet, Wagmi
- **Payments**: x402 protocol with Base network
- **Farcaster**: Frame SDK for Mini App detection and integration

## Prerequisites

- Node.js 18+
- pnpm v10 (install via [pnpm.io/installation](https://pnpm.io/installation))
- Coinbase Wallet
- API keys (see Environment Setup)

## Setup

1. Install and build all packages from the typescript examples root:

```bash
cd ../../
pnpm install
pnpm build
cd fullstack/miniapp
```

2. Copy environment variables:

```bash
cp env.example .env.local
```

3. Configure your environment variables (see Environment Setup below)

4. Start the development server:

```bash
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser

## Environment Setup

Configure the following variables in your `.env.local`:

### Required Variables

```bash
# OnchainKit Configuration
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key_here
NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME=x402 Mini App

# x402 Payment Configuration
RESOURCE_WALLET_ADDRESS=0x0000000000000000000000000000000000000000
NETWORK=base-sepolia

# CDP Wallet Configuration (required for x402 base mainnet settlements)
CDP_API_KEY_ID=your_cdp_api_key_id_here
CDP_API_KEY_SECRET=your_cdp_api_key_secret_here
CDP_WALLET_SECRET=your_cdp_wallet_secret_here
```

### Getting API Keys

1. **CDP API Keys**: Get from [Coinbase Developer Platform](https://portal.cdp.coinbase.com/projects/overview)
2. **OnchainKit API Key**: Get from [OnchainKit](https://onchainkit.xyz)
3. **Resource Wallet Address**: Your wallet address to receive payments
4. **Network**: Use `base-sepolia` for testing, `base` for production

## How It Works

### Farcaster Mini App Integration

The app uses the Farcaster Frame SDK to detect when it's running within a Mini App context:

```typescript
import { sdk } from "@farcaster/frame-sdk";

// Initialize and detect Mini App context
await sdk.actions.ready();
const isInMiniApp = await sdk.isInMiniApp();
```

### x402 Payment Protection

The `/api/protected` endpoint is protected using x402 middleware:

```typescript
// middleware.ts
export const middleware = paymentMiddleware(
  payTo,
  {
    "/api/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Protected route",
      },
    },
  },
  facilitator,
);
```

### Client-Side Payment Handling

The frontend uses `x402-fetch` to automatically handle payments when calling protected endpoints:

```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);
const response = await fetchWithPayment("/api/protected");
```

## Example Flow

1. **User opens the Mini App** in Farcaster
2. **Connect wallet** using OnchainKit's Wallet component
3. **Call protected API** - the app automatically:
   - Detects payment requirement (402 response)
   - Creates and signs payment transaction
   - Retries request with payment header
   - Receives protected content

## Response Format

### Payment Required (402)

```json
{
  "error": "X-PAYMENT header is required",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "resource": "http://localhost:3000/api/protected",
    "description": "Protected route",
    "payTo": "0xYourAddress",
    "maxTimeoutSeconds": 60
  }
}
```

### Successful Response

```json
{
  "message": "Protected content accessed successfully",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Extending the Example

### Adding More Protected Routes

Update the middleware configuration:

```typescript
export const middleware = paymentMiddleware(
  payTo,
  {
    "/api/protected": {
      price: "$0.01",
      network,
      config: {
        description: "Protected route",
      },
    },
    "/api/premium": {
      price: "$0.10",
      network,
      config: {
        description: "Premium content access",
      },
    },
  },
  facilitator,
);

export const config = {
  matcher: ["/api/protected", "/api/premium"],
  runtime: "nodejs",
};
```

### Customizing for Your Mini App

1. **Update the project name** in environment variables
2. **Modify the UI** to match your app's branding
3. **Add your own protected endpoints** following the x402 pattern
4. **Integrate with Farcaster data** using the Frame SDK
5. **Deploy to your domain** for Mini App distribution

## Publishing Your Mini App

1. **Deploy your app** to a public domain
2. **Submit to Farcaster** for Mini App discovery
3. **Configure your domain** in the Farcaster Mini App settings
4. **Test the full flow** in the Farcaster app

## Resources

- [Farcaster Mini Apps Documentation](https://miniapps.farcaster.xyz/)
- [x402 Protocol Documentation](https://x402.com)
- [OnchainKit Documentation](https://onchainkit.xyz)
- [Coinbase Developer Platform](https://portal.cdp.coinbase.com/)
